export type ProofApiResponse = {
  proof: string[]
}

export type DropApiResponse = {
  address: string
  collectionId: string
  version: number
  chainId: number
  networkName: string
}

export type ErrorApiResponse = {
  message: string
}
