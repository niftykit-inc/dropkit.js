# NiftyKit DropKit.js

JavaScript Client SDK library built with Typescript that provides an interface for NiftyKit Drops.

## Installation

1. Install via npm

```bash
npm install dropkit.js
```

2. Import via CDN

```html
<script src="https://unpkg.com/dropkit.js/dist/umd/index.js"></script>
```

## Example

```html
<!-- Import DropKit.js library -->
<script src="https://unpkg.com/dropkit.js/dist/umd/index.js"></script>

<script>
  document.getElementById('mint_btn').onclick = async function mint() {
    const drop = await DropKit.create('sdk-api-key-here'); // Supply API key
    await drop.mint(1); // Number of NFTs to mint
  }
</script>
```

## Enable Multiple Providers (Wallets)

This package uses [Web3modal](https://github.com/Web3Modal/web3modal), which allows you to connect to multiple wallets.
See the [Providers Options](https://github.com/Web3Modal/web3modal#provider-options)

You can add your custom providers into the `create` method like this:

```typescript
import Torus from '@toruslabs/torus-embed'
import WalletConnectProvider from '@walletconnect/web3-provider'
import WalletLink from 'walletlink'

const providers = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      infuraId: YOUR_INFURA_ID,
    },
  },
  torus: {
    package: Torus,
  },
  walletlink: {
    package: WalletLink,
    options: {
      infuraId: YOUR_INFURA_ID,
    },
  },
}

// and then init the Dropkit instance
const dropkit = await DropKit.create('sdk-api-key-here', false, providers);
```

## API

```typescript
class DropKit {
    static create(key: string, isDev?: boolean, providerOptions?: IProviderOptions): Promise<DropKit | null>;
    price(): Promise<BigNumber>;
    maxPerMint(): Promise<number>;
    maxPerWallet(): Promise<number>;
    walletTokensCount(): Promise<number>;
    totalSupply(): Promise<number>;
    saleActive(): Promise<boolean>;
    presaleActive(): Promise<boolean>;
    auctionActive(): Promise<boolean>;
    auctionDuration(): Promise<number>;
    auctionPrice(): Promise<BigNumber>;
    auctionStartedAt(): Promise<number>;
    generateProof(): Promise<ProofApiResponse & ErrorApiResponse>;
    mint(quantity: number): Promise<ContractReceipt | null>;
}
```
