import { extendEnvironment, task } from "@nomiclabs/buidler/config";
import fs from "fs";
import path from "path";

import { extractASTInformation } from "./helpers";

// Everything in a plugin must happen inside an exported function
extendEnvironment((env: any) => {
  // Force env to generate AST
  env.config.solc.outputSelection = { "*": { "*": ["*"], "": ["*"] } };
});

// Add a new task
task("build:ast-doc", "Generate document representation (in JSON) from AST")
  .addParam(
    "astDocDir",
    "Directory to output document representation extracted from the AST"
  )
  .setAction(async (taskArguments, bre) => {
    const { astDocDir } = taskArguments;

    const cachePath = bre.config.paths.cache;
    const solcInput = require(path.resolve(cachePath, "solc-input.json"));
    const solcOutput = require(path.resolve(cachePath, "solc-output.json"));

    const contractInformation = extractASTInformation(
      solcInput,
      solcOutput,
      "contract"
    );
    const interfaceInformation = extractASTInformation(
      solcInput,
      solcOutput,
      "interface"
    );
    const libraryInformation = extractASTInformation(
      solcInput,
      solcOutput,
      "library"
    );

    const astDocsData = Object.keys(solcInput.sources)
      .map(x => {
        const imports = solcOutput.sources[x].ast.nodes
          .filter(n => n.nodeType === "ImportDirective")
          .map(n => n.absolutePath);

        return {
          [x]: {
            imports,
            contracts: { ...contractInformation[x].contract },
            interfaces: { ...interfaceInformation[x].interface },
            libraries: { ...libraryInformation[x].library }
          }
        };
      })
      .reduce((acc, x) => {
        return { ...acc, ...x };
      }, {});

    // Write to file
    if (!fs.existsSync(astDocDir)) {
      fs.mkdirSync(astDocDir);
    }
    fs.writeFileSync(
      path.resolve(astDocDir, "ast-docs.json"),
      JSON.stringify(astDocsData, null, 4)
    );
  });
