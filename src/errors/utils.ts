import { EthereumRpcError } from 'eth-rpc-errors'

export function handleError(e: EthereumRpcError<unknown>): void {
  const msg = e.message
  // checks if the user has metamask installed
  if (msg.includes('missing provider') || msg.includes('No provider found')) {
    throw new Error(
      'Please install the MetaMask extension. If you are on mobile, open your MetaMask app and browse to this page.'
    )
  }

  // ideally we would check for the error code here, but the same error code (-32000)
  // is used for more than one error type.
  if (msg.includes('err: insufficient funds for gas * price + value')) {
    throw new Error('You do not have enough balance.')
  }

  throw Error(e.message)
}
