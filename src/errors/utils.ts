import { EthereumRpcError } from 'eth-rpc-errors'

export function handleError(e: EthereumRpcError<unknown>): void {
  // tries to parse Internal JSON RPC error, see https://eips.ethereum.org/EIPS/eip-1474#error-codes
  if (e.code === -32603) {
    e = e.data as EthereumRpcError<unknown>
  }

  const msg = e.message || 'Something went wrong.'
  // checks if the user has metamask installed
  if (msg.includes('missing provider') || msg.includes('No provider found')) {
    throw new Error(
      'Please install the MetaMask extension. If you are on mobile, open your MetaMask app and browse to this page.'
    )
  }

  // ideally we would check for the error code here, but the same error code: -32000 (Bad Input)
  // is used for more than one error type
  if (msg.includes('insufficient funds')) {
    throw new Error('Your wallet does not have enough balance.')
  }

  if (msg.includes('Exceeded max per wallet')) {
    throw new Error('Exceeded max per wallet')
  }

  if ((e.code as unknown as string) === 'CALL_EXCEPTION') {
    throw new Error('Please make sure you are connected to the right network.')
  }

  throw Error(msg)
}
