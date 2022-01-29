import detectEthereumProvider from '@metamask/detect-provider'
import axios from 'axios'
import { EthereumRpcError } from 'eth-rpc-errors'
import { ethers } from 'ethers'
import { API_ENDPOINT, API_ENDPOINT_DEV } from './config/endpoint'
import DropKitCollectionABI from './contracts/DropKitCollection.json'
import DropKitCollectionV2ABI from './contracts/DropKitCollectionV2.json'
import DropKitCollectionV3ABI from './contracts/DropKitCollectionV3.json'
import { handleError } from './errors/utils'

const abis: Record<number, any> = {
  2: DropKitCollectionABI.abi,
  3: DropKitCollectionV2ABI.abi,
  4: DropKitCollectionV3ABI.abi,
}

export default class DropKit {
  apiKey: string
  dev?: boolean
  address: string
  collectionId?: string
  contract: ethers.Contract | null
  walletAddress?: string
  version: number

  private get apiBaseUrl(): string {
    return this.dev ? API_ENDPOINT_DEV : API_ENDPOINT
  }

  constructor(key: string, isDev?: boolean) {
    if (!key) {
      throw new Error('No API key')
    }

    this.apiKey = key
    this.dev = isDev
    this.address = ''
    this.contract = null
    this.version = 0
  }

  async init(): Promise<{
    address: string
  }> {
    const { data } = await axios.get(`${this.apiBaseUrl}/drops/address`, {
      headers: {
        'x-api-key': this.apiKey,
      },
    })

    if (data) {
      this.address = data.address
      this.collectionId = data.collectionId
      this.version = data.version
      const abi = abis[data.version || 1]

      // const ethereum = (window as any).ethereum!
      const ethereum = (await detectEthereumProvider()) as any

      if (!ethereum) {
        throw new Error('No provider found')
      }

      // Connect to metamask
      await ethereum.request({ method: 'eth_requestAccounts' })

      const provider = new ethers.providers.Web3Provider(ethereum)
      const signerOrProvider = provider.getSigner()

      this.walletAddress = await signerOrProvider.getAddress()
      this.contract = new ethers.Contract(data.address, abi, signerOrProvider)
      if (!this.contract) {
        throw new Error('Initialization failed')
      }
    }

    return data.address
  }

  static async create(key: string, isDev?: boolean): Promise<DropKit | null> {
    try {
      const dropKit = new DropKit(key, isDev)
      await dropKit.init()
      return dropKit
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>)
      return null
    }
  }

  async price(): Promise<number> {
    const dropPrice =
      this.version <= 3
        ? await this.contract?._price()
        : await this.contract?.price()

    return Number(ethers.utils.formatEther(dropPrice))
  }

  async maxPerMint(): Promise<number> {
    const maxMint =
      this.version <= 3
        ? await this.contract?._maxPerMint()
        : await this.contract?.maxPerMint()

    return maxMint.toNumber()
  }

  async maxPerWallet(): Promise<number> {
    const maxWallet =
      this.version <= 3
        ? await this.contract?._maxPerWallet()
        : await this.contract?.maxPerWallet()

    return maxWallet.toNumber()
  }

  async walletTokensCount(): Promise<number> {
    return await this.contract?.balanceOf(this.walletAddress)
  }

  async totalSupply(): Promise<number> {
    const mintedNfts = await this.contract?.totalSupply()
    return mintedNfts.toNumber()
  }

  async saleActive(): Promise<boolean> {
    const saleActive =
      this.version <= 3
        ? await this.contract?.started()
        : await this.contract?.saleActive()

    return saleActive
  }

  async presaleActive(): Promise<boolean> {
    // First version of the contract ABI does not have presale
    if (this.version < 3) {
      return false
    }

    // Unfortunately, the presaleActive() method is not available in the v2 contracts
    // So we need to assume that the presale is active and check with generateProof()
    if (this.version === 3) {
      return !(await this.saleActive())
    }

    return await this.contract?.presaleActive()
  }

  async generateProof(): Promise<{ proof: Array<string> }> {
    const { data } = await axios.post(
      `${this.apiBaseUrl}/drops/list/${this.collectionId}`,
      {
        wallet: this.walletAddress,
      }
    )

    return data
  }

  async mint(quantity: number): Promise<void> {
    try {
      // safety check
      quantity = Number(Math.min(quantity, await this.maxPerMint()))

      const presaleActive = await this.presaleActive()
      const saleActive = await this.saleActive()

      const tokensCount = await this.walletTokensCount()
      const maxPerWallet = await this.maxPerWallet()

      if (tokensCount >= maxPerWallet) {
        throw new Error(
          `You can't mint more than ${maxPerWallet} tokens on your wallet`
        )
      }

      if (!saleActive && !presaleActive) {
        throw new Error('Collection is not active')
      }

      const price = await this.price()
      const amount = ethers.utils.parseEther(price.toString()).mul(quantity)

      // Presale minting
      if (presaleActive) {
        // Backwards compatibility with v2 contracts:
        // If the public sale is not active, we can still try mint with the presale
        await this._presaleMint(quantity, amount)
        return
      }

      // Regular minting
      await this._mint(quantity, amount)
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>)
    }
  }

  private async _mint(
    quantity: number,
    amount: ethers.BigNumber
  ): Promise<void> {
    const trx = await this.contract?.mint(quantity, {
      value: amount,
    })

    await trx.wait()
  }

  private async _presaleMint(
    quantity: number,
    amount: ethers.BigNumber
  ): Promise<void> {
    const data = await this.generateProof()
    if (!data.proof) {
      // Backwards compatibility for v2 contracts
      if (this.version === 3) {
        throw new Error(
          'Collection is not active or your wallet is not part of presale.'
        )
      }
      throw new Error('Your wallet is not part of presale.')
    }

    const trx = await this.contract?.presaleMint(quantity, {
      value: amount,
    })

    await trx.wait()
  }
}
