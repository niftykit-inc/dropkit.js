# NiftyKit DropKit.js

## Installation
1. Install via npm
```bash
$ npm install dropkit.js
```

2. Import via cdn
```html
<script src="https://unpkg.com/dropkit.js/dist/umd/index.js"></script>
```

## Example
```html
<!-- Import DropKit.js library -->
<script src="https://unpkg.com/dropkit.js/dist/umd/index.js"></script>

<script>
  document.getElementById('mint_btn').onclick = async function mint() {
    const drop = await DropKit.create('x-api-key-here'); // Supply API key
    await drop.mint(1); // Number of NFTs to mint
  }
</script>
```