import axios from 'axios'
import { EthereumRpcError } from 'eth-rpc-errors'
import {
  ethers,
  Contract,
  BigNumber,
  ContractTransaction,
  ContractReceipt,
} from 'ethers'
import { API_ENDPOINT, API_ENDPOINT_DEV } from './config/endpoint'
import DropKitCollectionABI from './contracts/DropKitCollection.json'
import DropKitCollectionV2ABI from './contracts/DropKitCollectionV2.json'
import DropKitCollectionV3ABI from './contracts/DropKitCollectionV3.json'
import { handleError } from './errors/utils'
import {
  DropApiResponse,
  ErrorApiResponse,
  ProofApiResponse,
} from './types/api-responses'
import Web3Modal, { IProviderOptions } from 'web3modal'
import { PROVIDER_OPTIONS } from './config/providers'

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
  contract: Contract = {} as Contract
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
    this.version = 0
  }

  async init(providerOptions: IProviderOptions): Promise<DropApiResponse> {
    const resp = await axios.get<DropApiResponse & ErrorApiResponse>(
      `${this.apiBaseUrl}/drops/address`,
      {
        headers: {
          'x-api-key': this.apiKey,
        },
        validateStatus: (status) => status < 500,
      }
    )

    if (resp.status === 401) {
      const { message } = resp.data as ErrorApiResponse
      throw new Error(message)
    }

    if (resp.status !== 200) {
      throw new Error('Something went wrong.')
    }

    const data = resp.data

    if (!data || !data.address || !data.collectionId) {
      throw new Error('Collection is not ready yet.')
    }

    this.address = data.address
    this.collectionId = data.collectionId
    this.version = data.version
    const abi = abis[data.version || 1]

    const web3Modal = new Web3Modal({
      providerOptions,
    })
    const instance = await web3Modal.connect()
    if (!instance) {
      throw new Error('No wallet selected')
    }

    if (instance.on) {
      instance.on('disconnect', () => {
        window.location.reload()
      })
      instance.on('accountsChanged', () => {
        window.location.reload()
      })
      instance.on('chainChanged', () => {
        window.location.reload()
      })
    }

    const provider = new ethers.providers.Web3Provider(instance)
    const signer = provider.getSigner()

    this.walletAddress = await signer.getAddress()
    this.contract = new ethers.Contract(data.address, abi, signer)
    if (!this.contract) {
      throw new Error('Initialization failed.')
    }

    return data
  }

  static async create(
    key: string,
    isDev?: boolean,
    providerOptions?: IProviderOptions
  ): Promise<DropKit | null> {
    try {
      const dropKit = new DropKit(key, isDev)
      await dropKit.init(providerOptions || PROVIDER_OPTIONS)
      return dropKit
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>)
      return null
    }
  }

  async price(): Promise<BigNumber> {
    const dropPrice: BigNumber =
      this.version <= 3
        ? await this.contract._price()
        : await this.contract.price()

    return dropPrice
  }

  async maxPerMint(): Promise<number> {
    const maxMint: BigNumber =
      this.version <= 3
        ? await this.contract._maxPerMint()
        : await this.contract.maxPerMint()

    return maxMint.toNumber()
  }

  async maxPerWallet(): Promise<number> {
    const maxWallet: BigNumber =
      this.version <= 3
        ? await this.contract._maxPerWallet()
        : await this.contract.maxPerWallet()

    return maxWallet.toNumber()
  }

  async walletTokensCount(): Promise<number> {
    const balanceOf: BigNumber = await this.contract.balanceOf(
      this.walletAddress
    )

    return balanceOf.toNumber()
  }

  async totalSupply(): Promise<number> {
    const mintedNfts: BigNumber = await this.contract.totalSupply()
    return mintedNfts.toNumber()
  }

  async saleActive(): Promise<boolean> {
    const saleActive: boolean =
      this.version <= 3
        ? await this.contract.started()
        : await this.contract.saleActive()

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

    return await this.contract.presaleActive()
  }

  async generateProof(): Promise<ProofApiResponse & ErrorApiResponse> {
    const { data } = await axios.post<ProofApiResponse & ErrorApiResponse>(
      `${this.apiBaseUrl}/drops/list/${this.collectionId}`,
      {
        wallet: this.walletAddress,
      },
      {
        validateStatus: (status) => status < 500,
      }
    )

    return data
  }

  async mint(quantity: number): Promise<ContractReceipt | null> {
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
      const amount = price.mul(quantity)

      // Presale minting
      if (presaleActive) {
        // Backwards compatibility with v2 contracts:
        // If the public sale is not active, we can still try mint with the presale
        return await this._presaleMint(quantity, amount)
      }

      // Regular minting
      return await this._mint(quantity, amount)
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>)
      return null
    }
  }

  private async _mint(
    quantity: number,
    amount: BigNumber
  ): Promise<ContractReceipt> {
    const trx: ContractTransaction = await this.contract.mint(quantity, {
      value: amount,
    })

    return trx.wait()
  }

  private async _presaleMint(
    quantity: number,
    amount: BigNumber
  ): Promise<ContractReceipt> {
    const data = await this.generateProof()
    if (data.message) {
      // Backwards compatibility for v2 contracts
      if (this.version === 3) {
        throw new Error(
          'Collection is not active or your wallet is not part of presale.'
        )
      }
      throw new Error('Your wallet is not part of presale.')
    }

    const trx: ContractTransaction = await this.contract.presaleMint(
      quantity,
      data.proof,
      {
        value: amount,
      }
    )

    return trx.wait()
  }
}
