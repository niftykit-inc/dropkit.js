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
import { JsonRpcSigner, Web3Provider } from '@ethersproject/providers'
import { NETWORKS } from './config/networks'

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
  provider: Web3Provider = {} as Web3Provider
  signer: JsonRpcSigner = {} as JsonRpcSigner
  web3ModalInstance: any
  chainId = 0
  networkName = ''

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
    const url = `${this.apiBaseUrl}/drops/${this.apiKey}/address`
    const resp = await axios.get<DropApiResponse & ErrorApiResponse>(url, {
      validateStatus: (status) => status < 500,
    })

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
    this.networkName = data.networkName
    this.chainId = data.chainId
    const abi = abis[data.version || 1]

    const web3Modal = new Web3Modal({
      providerOptions,
    })
    this.web3ModalInstance = await web3Modal.connect()
    if (!this.web3ModalInstance) {
      throw new Error('No wallet selected')
    }
    await this._initProvider()
    await this._checkNetwork()

    if (this.web3ModalInstance.on) {
      this.web3ModalInstance.on('disconnect', () => {
        window.location.reload()
      })
      this.web3ModalInstance.on('accountsChanged', () => {
        window.location.reload()
      })
    }

    this.walletAddress = await this.signer.getAddress()
    this.contract = new ethers.Contract(data.address, abi, this.signer)
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

  async auctionActive(): Promise<boolean> {
    if (this.version < 4) {
      return false
    }
    return await this.contract.auctionActive()
  }

  async auctionDuration(): Promise<number> {
    if (this.version < 4) {
      return 0
    }
    const duration: BigNumber = await this.contract.auctionDuration()

    return duration.toNumber()
  }

  async auctionPrice(): Promise<BigNumber> {
    if (this.version < 4) {
      return BigNumber.from(0)
    }
    const price: BigNumber = await this.contract.auctionPrice()

    return price
  }

  async auctionStartedAt(): Promise<number> {
    if (this.version < 4) {
      return 0
    }
    const epoch: BigNumber = await this.contract.auctionStartedAt()

    return epoch.toNumber()
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
      const auctionActive = await this.auctionActive()

      const tokensCount = await this.walletTokensCount()
      const maxPerWallet = await this.maxPerWallet()

      if (tokensCount + quantity > maxPerWallet) {
        throw new Error(
          `You can't mint more than ${maxPerWallet} tokens on your wallet`
        )
      }

      if (!saleActive && !presaleActive && !auctionActive) {
        throw new Error('Collection is not active')
      }

      const price = auctionActive
        ? await this.auctionPrice()
        : await this.price()
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

  private async _initProvider(): Promise<void> {
    this.provider = new ethers.providers.Web3Provider(this.web3ModalInstance)
    this.signer = this.provider.getSigner()
  }

  private async _checkNetwork(): Promise<void> {
    const network = await this.provider.getNetwork()
    if (this.chainId !== network.chainId) {
      // see https://docs.metamask.io/guide/rpc-api.html#usage-with-wallet-switchethereumchain
      try {
        await this.web3ModalInstance.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${this.chainId.toString(16)}` }],
        })
      } catch (error: any) {
        const switchError = error as EthereumRpcError<unknown>
        if (switchError.code === 4902) {
          const network = NETWORKS[this.chainId]
          if (!network) {
            throw new Error('Unknown network')
          }
          try {
            await this.web3ModalInstance.request({
              method: 'wallet_addEthereumChain',
              params: [network],
            })
          } catch (addError: any) {
            throw addError
          }
        } else {
          throw error
        }
      }

      await this._initProvider()
    }
  }
}
