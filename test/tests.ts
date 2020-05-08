// tslint:disable-next-line no-implicit-dependencies
import { assert } from "chai";
import path from "path";

import { useEnvironment } from "./helpers";

describe("Integration tests examples", function() {
  describe("Buidler Runtime Environment extension", function() {
    useEnvironment(__dirname + "/buidler-project");

    it("AST Plugin works as expected", async function() {
      // Generate AST
      await this.env.run("clean");
      await this.env.run("compile");

      // Cache folder
      const cacheFolder = this.env.config.paths.cache;
      const solcOutput = require(path.resolve(cacheFolder, "solc-output.json"));
      const contractNames = Object.keys(solcOutput.sources);

      const docsFolder = path.resolve(cacheFolder, "docs");

      // Make sure the compiled outputs has the AST structure
      const hasAST =
        contractNames
          .map(n => solcOutput.sources[n])
          .filter(x => x.ast !== undefined).length > 0;
      assert.isTrue(hasAST);

      // Now try and build the docs
      await this.env.run("build:ast-doc", {
        astDocDir: docsFolder
      });
    });
  });
});
