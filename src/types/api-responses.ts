export type ProofApiResponse = {
  proof: string[]
}

export type ProofApiResponseV2 = ProofApiResponse & {
  allowed: number
}

export type DropApiResponse = {
  address: string
  collectionId: string
  version: number
  chainId: number
  networkName: string
  maxAmount?: number
}

export type ErrorApiResponse = {
  message: string
}
