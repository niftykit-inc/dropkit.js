import detectEthereumProvider from '@metamask/detect-provider'
import axios from 'axios'
import { ethers } from 'ethers'
import {
  ADDRESS_CHECK_ENDPOINT,
  ADDRESS_CHECK_ENDPOINT_DEV,
} from './config/endpoint'
import {
  DropKitCollection,
  // eslint-disable-next-line camelcase
  DropKitCollection__factory,
} from './typechain-types'

export default class DropKit {
  apiKey: string
  dev?: boolean
  address: string
  contract: DropKitCollection | null

  constructor(key: string, isDev?: boolean) {
    if (!key) {
      throw new Error('No API key')
    }

    this.apiKey = key
    this.dev = isDev
    this.address = ''
    this.contract = null
  }

  async init(): Promise<{
    address: string
  }> {
    const { data } = await axios.get(
      this.dev ? ADDRESS_CHECK_ENDPOINT_DEV : ADDRESS_CHECK_ENDPOINT,
      {
        headers: {
          'x-api-key': this.apiKey,
        },
      }
    )

    if (data) {
      this.address = data.address

      // const ethereum = (window as any).ethereum!
      const ethereum = (await detectEthereumProvider()) as any

      if (!ethereum) {
        throw new Error('No provider found')
      }

      // Connect to metamask
      await ethereum.request({ method: 'eth_requestAccounts' })

      const provider = new ethers.providers.Web3Provider(ethereum)
      const signerOrProvider = provider.getSigner()

      this.contract = DropKitCollection__factory.connect(
        data.address,
        signerOrProvider
      )
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

    const dropPrice = await this.contract.price()
    return Number(ethers.utils.formatEther(dropPrice))
  }

  async maxPerMint(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const maxMint = await this.contract.maxPerMint()
    return maxMint.toNumber()
  }

  async maxPerWallet(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const maxWallet = await this.contract.maxPerWallet()
    return maxWallet.toNumber()
  }

  async totalSupply(): Promise<number> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const mintedNfts = await this.contract.totalSupply()
    return mintedNfts.toNumber()
  }

  async mint(quantity: number): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Initialization failed')
    }

    const price = await this.price()

    const results = await this.contract.mint(quantity, {
      value: ethers.utils.parseEther(price.toString()).mul(quantity),
    })
    await results.wait()

    return true
  }
}
