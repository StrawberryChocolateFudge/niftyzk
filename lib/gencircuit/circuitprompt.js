const chalk = require("chalk");

const inquirer = require("inquirer").default

const fs = require("fs")
const path = require("path");
const { CIRCUITSDIR, LIBPATH, TESTPATH, COMPILEDDIR } = require("../paths.js");

const { getPoseidonCommitmentHasher, getGenericCircuit } = require("../templates/circom/genericCommitmentVerifier.js");

const { getJsLib, getTests } = require("../templates/js/templates.js");

function circuitPrompts() {
    console.log("Generating a generic circuit with a commitment reveal scheme and a nullifier.")
    inquirer.prompt([
        {
            type: "confirm",
            name: "addpubinputs",
            message: "Do you wish to add tamperproof public inputs? (E.g: walletaddress): ",
            default: true
        },
        {
            type: "input",
            name: "pubInputs",
            message: "Enter the name of the public inputs in a comma separated list (no numbers or special characters): ",
            when(answers) {
                return answers["addpubinputs"];
            }
        }
    ]).then(async (answers) => {

        const { addpubinputs, pubInputs } = answers;
        if (addpubinputs) {
            const publicInputsArr = sanitizePublicInputs(pubInputs)
            genCircuits(publicInputsArr)


            genJs(publicInputsArr)

            console.log(chalk.green("Done"))
        } else {
            genCircuits([])
            genJs([])
        }

    }).catch(err => {
        console.log(err)
        console.log("Aborted")
    })
}

function sanitizePublicInputs(pubInputString) {
    const array = pubInputString.toLowerCase().replaceAll(" ", "").split(",")
    for (let i = 0; i < array.length; i++) {
        if (!onlyLowercaseLetters(array[i])) {
            console.log(`Invalid public input name ${chalk.red(array[i])}`)
            throw new Error("Invalid input")
        }
    }
    //remove duplicates
    return Array.from(new Set(array));
}

function onlyLowercaseLetters(str) {
    return /^[a-z]*$/.test(str)
}

function genCircuits(publicInputsArr) {
    console.log(chalk.yellow("Generating circuits"))


    if (!fs.existsSync(CIRCUITSDIR)) {
        fs.mkdirSync(CIRCUITSDIR)
    }

    const circuitTemplates = [
        {
            name: "commitment_hasher.circom",
            content: getPoseidonCommitmentHasher()
        },
        {
            name: "circuit.circom",
            content: getGenericCircuit(publicInputsArr)
        }
    ]

    //write the circuits to file

    fs.writeFileSync(path.join(CIRCUITSDIR, circuitTemplates[0].name), circuitTemplates[0].content)
    fs.writeFileSync(path.join(CIRCUITSDIR, circuitTemplates[1].name), circuitTemplates[1].content)

    //Delete the compiled directory from the circuits
    delete_compiled_if_exists()

}

function genJs(extraPublicInputsArr) {
    console.log(chalk.yellow("Generating javascript"))
    if (!fs.existsSync(LIBPATH)) {
        fs.mkdirSync(LIBPATH)
    }
    if (!fs.existsSync(TESTPATH)) {
        fs.mkdirSync(TESTPATH)
    }

    const lib = getJsLib(extraPublicInputsArr)
    const tests = getTests(extraPublicInputsArr)

    fs.writeFileSync(path.join(LIBPATH, "index.js"), lib)
    fs.writeFileSync(path.join(TESTPATH, "index.test.js"), tests)
}

function delete_compiled_if_exists() {
    if (fs.existsSync(COMPILEDDIR)) {
        fs.rmSync(COMPILEDDIR, { recursive: true })
    }
}

module.exports = { circuitPrompts }