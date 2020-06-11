import { extendEnvironment, task } from "@nomiclabs/buidler/config";
import {
  SOLC_INPUT_FILENAME,
  SOLC_OUTPUT_FILENAME
} from "@nomiclabs/buidler/internal/constants";
import { BuidlerPluginError, lazyObject } from "@nomiclabs/buidler/plugins";
import fs from "fs";
import path from "path";

import { extractASTInformation } from "./helpers";

export class ASTDocsBuidlerEnvironment {
  constructor(
    public readonly path: string = null,
    public readonly file: string = "ast-docs.json",
    public readonly ignores: string = ""
  ) {}
}

declare module "@nomiclabs/buidler/types" {
  export interface BuidlerRuntimeEnvironment {
    astdocs: ASTDocsBuidlerEnvironment;
  }

  export interface BuidlerConfig {
    astdocs?: {
      path?: string;
      file?: string;
      ignores?: string;
    };
  }
}

// Everything in a plugin must happen inside an exported function
extendEnvironment((env: any) => {
  // Force env to generate AST
  env.config.solc.outputSelection = { "*": { "*": ["*"], "": ["*"] } };

  env.astdocs = lazyObject(() => {
    if (env.config.astdocs) {
      return new ASTDocsBuidlerEnvironment(
        env.config.astdocs.path,
        env.config.astdocs.file,
        env.config.astdocs.ignores
      );
    }
    return new ASTDocsBuidlerEnvironment();
  });
});

task("compile", "compilation step", async (taskArguments, bre, runSuper) => {
  await runSuper();

  // now do AST processing
  createAST({ bre });
});

const createAST = ({ bre }) => {
  const { astdocs }: { astdocs: ASTDocsBuidlerEnvironment } = bre;
  const cachePath = bre.config.paths.cache;
  const astDocDir = astdocs.path || cachePath;

  const solcInputPath = path.resolve(cachePath, SOLC_INPUT_FILENAME);
  const solcOutputPath = path.resolve(cachePath, SOLC_OUTPUT_FILENAME);

  if (!fs.existsSync(solcInputPath)) {
    throw new BuidlerPluginError("Cannot find solidity input source");
  } else if (!fs.existsSync(solcOutputPath)) {
    throw new BuidlerPluginError("Cannot find solidity output source");
  }
  const solcInput = require(solcInputPath);
  const solcOutput = require(solcOutputPath);

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
    .filter(x => !astdocs.ignores || !x.includes(astdocs.ignores))
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
    fs.mkdirSync(astDocDir, { recursive: true });
  }

  fs.writeFileSync(
    path.resolve(astDocDir, astdocs.file),
    JSON.stringify(astDocsData, null, 4)
  );

  console.log(
    "[buidler-ast-doc]: Wrote AST to",
    path.join(astDocDir, astdocs.file)
  );
};
