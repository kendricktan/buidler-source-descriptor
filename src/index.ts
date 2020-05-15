import { extendEnvironment, task } from "@nomiclabs/buidler/config";
import fs from "fs";
import path from "path";
import { isObject } from "util";

// Just an ad-hoc helper function
const e2 = (a, b, c) => {
  try {
    return a[b][c];
  } catch (e) {
    return [];
  }
};

// Extracts out lineNumber
const getLineNumberFromOffset = (solcInput, contractSource, rawOffset) => {
  if (rawOffset === undefined) {
    return 0;
  }
  // Injects line numbers (retrieved via character offset)
  const offset = rawOffset.split(":")[0];

  let sourceCode;
  if (isObject(solcInput.sources[contractSource])) {
    sourceCode = solcInput.sources[contractSource].content;
  } else {
    sourceCode = solcInput.sources[contractSource];
  }

  const sourceCodeTillOffset = sourceCode.substring(0, parseInt(offset, 10));

  // Line number starts at 1
  const lineNumber = 1 + (sourceCodeTillOffset.match(/\n/g) || []).length;

  return lineNumber;
};

// Extract information from node types (This is a partial function...)
const extractFunctionDefNodeInfo = (solcInput, node) => {
  const { lineNumber, name, visibility } = node;
  const parameters = node.parameters.parameters.map(
    x => `${x.typeDescriptions.typeString} ${x.name}`
  );
  const returnParams = node.returnParameters.parameters.map(
    x => `${x.typeDescriptions.typeString}`
  );
  const modifiers = node.modifiers.map(x => x.modifierName.name);
  const events =
    node.body === null
      ? []
      : node.body.statements
          .filter(x => x.nodeType === "EmitStatement")
          .map(x => x.eventCall.expression.name);

  const requires =
    node.body === null
      ? []
      : node.body.statements
          .filter(
            x =>
              x.nodeType === "ExpressionStatement" ||
              x.nodeType === "FunctionCall"
          )
          .map(x => x.expression)
          .filter(x => {
            try {
              return x.expression.name.toLowerCase().includes("require");
            } catch {
              return false;
            }
          })
          .map(x => {
            const reqLineNumber = getLineNumberFromOffset(
              solcInput,
              node.contractSource,
              x.src
            );

            if (x.expression.name === "require") {
              const literalString = x.expression.argumentTypes
                .slice(-1)[0]
                .typeString.split(" ")
                .slice(1)
                .join(" ")
                .split('"')
                .join("");

              return {
                lineNumber: reqLineNumber,
                name: `require(..., ${literalString})`
              };
            }

            return {
              lineNumber: reqLineNumber,
              name: x.expression.name
            };
          });

  return {
    name: name === "" ? node.kind : name,
    signature: `${name}(${parameters.join(", ")}) ${visibility}`,
    returns: `(${returnParams.join(", ")})`,
    events,
    modifiers,
    visibility,
    requires,
    lineNumber
  };
};

const extractModifierDefNodeInfo = (node: any) => {
  const { name, visibility, lineNumber } = node;
  const parameters = node.parameters.parameters.map(
    (x: any) => `${x.typeDescriptions.typeString} ${x.name}`
  );

  return {
    name,
    parameters: `(${parameters.join(", ")})`,
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
    type: typeName.typeDescriptions.typeString,
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
    const contractSources = Object.keys(solcOutput.sources);
    const asts: any[] = contractSources.map(x => {
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

        return ast.nodes
          .filter(y => {
            return y.nodeType === "ContractDefinition";
          })
          .map(y => {
            return { contractSource, contractName: y.name, [y.name]: { ...y } };
          });
      })
      .reduce((acc, x) => acc.concat(x), []);

    // Extract out contract definition
    // and inject in line numbers into each definition
    const filterDefForNodeType = t => {
      return astsDef.map(d => {
        const { contractSource, contractName } = d;
        const { nodes } = d[contractName];

        return nodes
          .filter(x => x.nodeType === t)
          .map(x => {
            return { contractSource, contractName, ...x };
          })
          .map(x => {
            const lineNumber = getLineNumberFromOffset(
              solcInput,
              x.contractSource,
              x.src
            );

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

    // Massage data so the contractSource will be the key (e.g. "constract/Parent.sol")
    // While the contractName will be the inner key
    /*
    {
      Multiple.sol: {
        One: [...node],
        Two: [...node]
      }
    }
    */
    const massageToInContracts = (defs, extractFunc) => {
      return defs.reduce((acc, x) => {
        const f = x.reduce((acc2, n) => {
          // Copy the accumulator
          const accCopy = { ...acc2 };

          if (accCopy[n.contractSource] === undefined) {
            accCopy[n.contractSource] = {};
          }

          accCopy[n.contractSource][n.contractName] = Array.prototype.concat(
            accCopy[n.contractSource][n.contractName] || [],
            extractFunc(n)
          );

          return accCopy;
        }, {});

        if (Object.keys(f).length === 0) {
          return acc;
        }

        const fKey = Object.keys(f)[0];
        const mergedF = {
          [fKey]: {
            ...acc[fKey],
            ...f[fKey]
          }
        };

        return { ...acc, ...mergedF };
      }, {});
    };

    const functionsInContracts = massageToInContracts(functionDefs, node =>
      extractFunctionDefNodeInfo(solcInput, node)
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

    // Merge everything together
    const astDocOutput = contractSources
      .map(x => {
        const contractNames = Object.keys({
          ...functionsInContracts[x],
          ...eventsInContracts[x],
          ...variablesInContracts[x],
          ...modifiersInContracts[x],
          ...structsInContracts[x]
        });

        const contractWithContext = contractNames
          .map(y => {
            return {
              [y]: {
                functions: e2(functionsInContracts, x, y),
                events: e2(eventsInContracts, x, y),
                variables: e2(variablesInContracts, x, y),
                modifiers: e2(modifiersInContracts, x, y),
                structs: e2(structsInContracts, x, y)
              }
            };
          })
          .reduce((acc, y) => {
            return { ...acc, ...y };
          }, {});

        return {
          [x]: contractWithContext
        };
      })
      .reduce((acc, x) => {
        return { ...acc, ...x };
      }, {});

    // Massage the output to a more user friendly format
    // And also inject in the imports
    // e.g. all contracts will now be in contracts key
    const astDocOutputFixed1 = Object.keys(astDocOutput)
      .map(x => {
        const imports = solcOutput.sources[x].ast.nodes
          .filter(n => n.nodeType === "ImportDirective")
          .map(n => n.absolutePath);

        return {
          [x]: {
            imports,
            contracts: { ...astDocOutput[x] }
          }
        };
      })
      .reduce((acc, x) => {
        return { ...acc, ...x };
      }, {});

    // Injects in inheritance and imports for each contract
    const astDocOutputFixed2 = Object.keys(astDocOutputFixed1)
      .map(x => {
        // Get all inheritance for each contract
        const inherits = Object.keys(astDocOutputFixed1[x].contracts).map(y => {
          const i = solcOutput.sources[x].ast.nodes.filter(
            n => n.nodeType === "ContractDefinition" && n.name === y
          )[0];

          return {
            name: y,
            inherits: i.baseContracts.map(z => z.baseName.name)
          };
        });

        const astOutputCopy: any = { ...astDocOutputFixed1[x] };

        // I'm mutating state here, shoot me
        inherits.map(y => {
          astOutputCopy.contracts[y.name].inherits = y.inherits;
        });

        return {
          [x]: {
            ...astOutputCopy
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
      JSON.stringify(astDocOutputFixed2, null, 4)
    );
  });
