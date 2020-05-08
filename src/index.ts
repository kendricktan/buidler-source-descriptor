import { extendEnvironment, task } from "@nomiclabs/buidler/config";
import fs from "fs";
import path from "path";
import { isObject } from "util";

// Extract information from node types
const extractFunctionDefNodeInfo = (node: any) => {
  const { lineNumber, name, documentation, visibility } = node;
  const parameters = node.parameters.parameters.map(
    (x: any) => `${x.typeDescriptions.typeString} ${x.name}`
  );
  const returnParams = node.returnParameters.parameters.map(
    (x: any) => `${x.typeDescriptions.typeString}`
  );
  const modifiers = node.modifiers.map((x: any) => x.modifierName.name);
  const events =
    node.body === null
      ? []
      : node.body.statements
          .filter((x: any) => x.nodeType === "EmitStatement")
          .map((x: any) => x.eventCall.expression.name);

  return {
    name: name === "" ? node.kind : name,
    signature: `${name}(${parameters.join(", ")}) ${visibility}`,
    returns: `(${returnParams.join(", ")})`,
    events,
    modifiers,
    documentation,
    visibility,
    lineNumber
  };
};

const extractModifierDefNodeInfo = (node: any) => {
  const { name, visibility, documentation, lineNumber } = node;
  const parameters = node.parameters.parameters.map(
    (x: any) => `${x.typeDescriptions.typeString} ${x.name}`
  );

  return {
    name,
    parameters: `(${parameters.join(", ")})`,
    documentation,
    visibility,
    lineNumber
  };
};

const extractEventDefNodeInfo = (node: any) => {
  const { name, lineNumber } = node;
  const parameters = node.parameters.parameters.map(
    (x: any) => `${x.typeDescriptions.typeString} ${x.name}`
  );

  return {
    name,
    parameters: `(${parameters.join(", ")})`,
    lineNumber
  };
};

const extractVariableDefNodeInfo = (node: any) => {
  const { name, lineNumber, visibility, typeName } = node;

  return {
    name,
    signature: `${typeName.typeDescriptions.typeString} ${visibility} ${name}`,
    lineNumber,
    visibility
  };
};

const extractStructDefNodeInfo = (node: any) => {
  const { name, lineNumber } = node;
  const members = node.members.map(x => {
    return {
      name: x.name,
      type: x.typeDescriptions.typeString
    };
  });

  return {
    name,
    members,
    lineNumber
  };
};

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

    // Get contracts from solc output
    const contractNames = Object.keys(solcOutput.sources);
    const asts: any[] = contractNames.map(x => {
      return {
        contractSource: x,
        ast: solcOutput.sources[x].ast
      };
    });

    // For each contracts, extract out AST and get the contract definitions
    // and flatten it from [[]] -> []
    const astsDef = asts
      .map(x => {
        const { contractSource, ast } = x;

        // Try and

        return ast.nodes
          .filter(y => {
            return y.nodeType === "ContractDefinition";
          })
          .map(y => {
            return { contractSource, ...y };
          });
      })
      .reduce((acc, x) => acc.concat(x), []);

    // Extract out contract definition
    // and inject in line numbers into each definition
    const filterDefForNodeType = t => {
      return astsDef.map(d => {
        const { contractSource, nodes } = d;
        return nodes
          .filter(x => x.nodeType === t)
          .map(x => {
            return { contractSource, ...x };
          })
          .map(x => {
            if (x.src === undefined) {
              return x;
            }
            // Injects line numbers (retrieved via character offset)
            const offset = x.src.split(":")[0];

            let sourceCode;
            if (isObject(solcInput.sources[x.contractSource])) {
              sourceCode = solcInput.sources[x.contractSource].content;
            } else {
              sourceCode = solcInput.sources[x.contractSource];
            }

            const sourceCodeTillOffset = sourceCode.substring(
              0,
              parseInt(offset, 10)
            );

            // Starts at 1
            const lineNumber =
              1 + (sourceCodeTillOffset.match(/\n/g) || []).length;

            return { lineNumber, ...x };
          });
      });
    };

    // Extract out relevant information that we care about
    // e.g. Functions, Events, Variables, and Modifiers
    const functionDefs = filterDefForNodeType("FunctionDefinition");
    const eventDefs = filterDefForNodeType("EventDefinition");
    const variableDefs = filterDefForNodeType("VariableDeclaration");
    const modifierDefs = filterDefForNodeType("ModifierDefinition");
    const structDefs = filterDefForNodeType("StructDefinition");

    // Massage data so the contract source (e.g. "contracts/Parent.sol")
    // is now the key
    const massageToInContracts = (defs, extractFunc) => {
      return defs.reduce((acc, x) => {
        const f = x.reduce((acc2, n) => {
          acc2[n.contractSource] = Array.prototype.concat(
            acc2[n.contractSource] || [],
            extractFunc(n)
          );
          return acc2;
        }, {});

        return { ...acc, ...f };
      }, {});
    };

    const functionsInContracts = massageToInContracts(
      functionDefs,
      extractFunctionDefNodeInfo
    );
    const eventsInContracts = massageToInContracts(
      eventDefs,
      extractEventDefNodeInfo
    );
    const variablesInContracts = massageToInContracts(
      variableDefs,
      extractVariableDefNodeInfo
    );
    const modifiersInContracts = massageToInContracts(
      modifierDefs,
      extractModifierDefNodeInfo
    );
    const structsInContracts = massageToInContracts(
      structDefs,
      extractStructDefNodeInfo
    );

    // Merge everything together and extract out
    const astDocOutput = contractNames
      .map(x => {
        return {
          [x]: {
            functions: functionsInContracts[x],
            events: eventsInContracts[x],
            variables: variablesInContracts[x],
            modifiers: modifiersInContracts[x],
            structs: structsInContracts[x]
          }
        };
      })
      .reduce((acc, x) => {
        return { ...acc, ...x };
      }, {});

    // Inject in each contract's description
    const astDocOutputWithMetadata = Object.keys(astDocOutput)
      .map(x => {
        const metadata = solcOutput.sources[x].ast.nodes
          .filter(n => n.nodeType === "ContractDefinition")
          .map(n => {
            return {
              documentation: n.documentation,
              contractName: n.name
            };
          });
        return {
          [x]: {
            metadata,
            ...astDocOutput[x]
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
      JSON.stringify(astDocOutputWithMetadata, null, 4)
    );
  });
