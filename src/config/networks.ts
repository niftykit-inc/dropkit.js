import { Network } from '../types/network'

export const NETWORKS: Record<number, Network> = {
  137: {
    chainId: '0x89', // 137
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://www.polygonscan.com/'],
  },
  80001: {
    chainId: '0x13881', // 80001
    chainName: 'Polygon Testnet Mumbai',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://matic-mumbai.chainstacklabs.com'],
    blockExplorerUrls: ['https://mumbai.polygonscan.com/'],
  },
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
