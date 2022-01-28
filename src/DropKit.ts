import detectEthereumProvider from '@metamask/detect-provider'
import axios from 'axios'
import { ethers } from 'ethers'
import { API_ENDPOINT, API_ENDPOINT_DEV } from './config/endpoint'
import DropKitCollectionABI from './contracts/DropKitCollection.json'
import DropKitCollectionV2ABI from './contracts/DropKitCollectionV2.json'
import DropKitCollectionV3ABI from './contracts/DropKitCollectionV3.json'

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
    }

    return data.address
  }

  static async create(key: string, isDev?: boolean): Promise<DropKit> {
    const dropKit = new DropKit(key, isDev)
    await dropKit.init()
    return dropKit
  }

  async price(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const dropPrice =
      this.version <= 3
        ? await this.contract._price()
        : await this.contract.price()
    return Number(ethers.utils.formatEther(dropPrice))
  }

  async maxPerMint(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const maxMint =
      this.version <= 3
        ? await this.contract._maxPerMint()
        : await this.contract.maxPerMint()

    return maxMint.toNumber()
  }

  async maxPerWallet(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const maxWallet =
      this.version <= 3
        ? await this.contract._maxPerWallet()
        : await this.contract.maxPerWallet()

    return maxWallet.toNumber()
  }

  async totalSupply(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const mintedNfts = await this.contract.totalSupply()
    return mintedNfts.toNumber()
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
    if (!this.contract) {
      throw new Error('Initialization failed')
    }
    const price = await this.price()

    // Presale mint
    try {
      const data = await this.generateProof()
      const results = await this.contract.presaleMint(quantity, data.proof, {
        value: ethers.utils.parseEther(price.toString()).mul(quantity),
      })
      await results.wait()

      return
    } catch (err) {
      console.log(err)
    }

    const results = await this.contract.mint(quantity, {
      value: ethers.utils.parseEther(price.toString()).mul(quantity),
    })
    await results.wait()

    return
  }
}
