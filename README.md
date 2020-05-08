# Buidler-ast-doc


# Quickstart
```shell
npm install buidler-ast-doc
```

Add this to your `buidler.config.js`:
```javascript
const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('buidler-ast-doc');
```

```shell
npx buidler build:ast-doc --ast-doc-dir ./build/cache/docs
```

# What does it do
Parses the AST to generate (richer) documentation.

Data is serialized in a JSON blob, e.g.

```json
[
    "contracts/Parent.sol": {
        "functions": [
            {
                "name": "",
                "signature": "() external",
                "returns": "()",
                "events": [],
                "modifiers": [],
                "documentation": null,
                "visibility": "external",
                "lineNumber": 8
            },
            {
                "name": "",
                "signature": "(address _owner) public",
                "returns": "()",
                "events": [
                    "OwnerChanged"
                ],
                "modifiers": [],
                "documentation": null,
                "visibility": "public",
                "lineNumber": 10
            },
            {
                "name": "nominateNewOwner",
                "signature": "nominateNewOwner(address _owner) external",
                "returns": "()",
                "events": [
                    "OwnerNominated"
                ],
                "modifiers": [
                    "onlyOwner"
                ],
                "documentation": null,
                "visibility": "external",
                "lineNumber": 16
            },
            {
                "name": "acceptOwnership",
                "signature": "acceptOwnership() external",
                "returns": "()",
                "events": [
                    "OwnerChanged"
                ],
                "modifiers": [],
                "documentation": null,
                "visibility": "external",
                "lineNumber": 21
            }
        ],
        "events": [
            {
                "name": "OwnerNominated",
                "parameters": "(address newOwner)",
                "lineNumber": 47
            },
            {
                "name": "OwnerChanged",
                "parameters": "(address oldOwner, address newOwner)",
                "lineNumber": 48
            }
        ],
        "variables": [
            {
                "name": "owner",
                "signature": "address public owner",
                "lineNumber": 5,
                "visibility": "public"
            },
            {
                "name": "nominatedOwner",
                "signature": "address public nominatedOwner",
                "lineNumber": 6,
                "visibility": "public"
            }
        ],
        "modifiers": [
            {
                "name": "onlyOwner",
                "parameters": "()",
                "documentation": null,
                "visibility": "internal",
                "lineNumber": 31
            },
            {
                "name": "onlySpecificAddress",
                "parameters": "(address user)",
                "documentation": null,
                "visibility": "internal",
                "lineNumber": 39
            }
        ]
    }
]
```