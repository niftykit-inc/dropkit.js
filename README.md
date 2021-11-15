# NiftyKit DropKit.js

## Installation
1. Install via npm
```bash
$ npm install dropkit.js
```

2. Import via cdn
```html
<script src="https://unpkg.com/dropkit.js-test/dist/umd/index.js"></script>
```

## Example
```html
<!-- Import DropKit.js library -->
<script src="https://unpkg.com/dropkit.js-test/dist/umd/index.js"></script>

<script>
    // On Mint button click
    $("#mint_btn").click(async function () {
      const drop = await DropKit.create('x-api-key-here'); // Supply API key
      await drop.mint(1); // Number of NFTs to mint
    });
</script>
```