// tslint:disable-next-line no-implicit-dependencies
import { assert } from "chai";
import path from "path";

import { SOLC_OUTPUT_FILENAME } from "@nomiclabs/buidler/internal/constants";

import { useEnvironment } from "./helpers";
import { ASTDocsBuidlerEnvironment } from "../src";

describe("Integration tests examples", function () {
  describe("Buidler Runtime Environment extension", function () {
    useEnvironment(__dirname + "/buidler-project");

    beforeEach(async function () {
      await this.env.run("clean");
    });

    it("AST Plugin works as expected", async function () {

      // Now try and build the docs
      await this.env.run("compile");

      const cacheFolder = this.env.config.paths.cache;
      const solcOutput = require(path.resolve(cacheFolder, SOLC_OUTPUT_FILENAME));
      const contractNames = Object.keys(solcOutput.sources);

      // Make sure the compiled outputs has the AST structure
      const hasAST =
        contractNames
          .map(n => solcOutput.sources[n])
          .filter(x => x.ast !== undefined).length > 0;
      assert.isTrue(hasAST);

      const astdocs: ASTDocsBuidlerEnvironment = this.env.astdocs;

      // find the ast file is where it's expected
      const ast = require(path.resolve(astdocs.path, astdocs.file));

      // and ensure the files expected were parsed
      assert.deepEqual(Object.keys(ast), ["contracts/Child.sol", "contracts/Parent.sol", "contracts/Multiple.sol"]);

    });
  });
});
