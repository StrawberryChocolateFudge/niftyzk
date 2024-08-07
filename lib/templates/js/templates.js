function getImports() {
    return `
import { utils } from "ffjavascript";
import crypto from "crypto";
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
    
`
}

function getRandom() {
    return `
/**
 * @returns {bigint} Returns a random bigint
 */
export function rbigint() { return utils.leBuff2int(crypto.randomBytes(31)) };
   `
}

//TODO: Use JSDoc for types union types
//https://jsdoc.app/about-getting-started
//https://github.com/StrawberryChocolateFudge/bunnynotes-private/blob/bunnyBundles/lib/generateCommitmentHash.ts
function getHashers() {
    return `
/**
 * @param args {Array<bigint>} - A list of bigint to compute the hash
 * @returns {bigint} Returns the poseidon hash
 */
export async function poseidon(args){
    const hasher = await buildPoseidon();
    const hashBytes = hasher(args);
    const hash = hasher.F.toString(hashBytes);
    return BigInt(hash);
}

/**
 * 
 * @param nullifier {string | bigint} - The nullifier used for the circuit
 * @param secret {string | bigint} - The secret used for the circuit 
 * @returns {bigint} Returns a poseidon hash
 */
export async function generateCommitmentHash(nullifier, secret){
    return await poseidon([BigInt(nullifier),BigInt(secret)])
}
/**
 * @param nullifier {string | bigint} - The nullifier used for the circuit
 * @returns {bigint} Returns the poseidon hash 
 */
export async function generateNullifierHash(nullifier){
    return await poseidon([BigInt(nullifier)])
}
    `
}
function getGenerateProof(extraPublicInputs) {
    const publicInputParams = extraPublicInputs.map((inp) => `\n * @param {bigint | string} options.publicInputs.${inp}`).join(" ")
    return `
/**
 * @param {Object} options - The arguments for the compute proof
 * @param {bigint | string} options.secret - The secret used for the commitment reveal scheme
 * @param {bigint | string} options.nullifier
 * @param {Object} options.publicInputs
 * @param {bigint | string} options.publicInputs.commitmentHash
 * @param {bigint | string} options.publicInputs.nullifierHash${extraPublicInputs.length === 0 ? " *" : publicInputParams} - The nullifier used for mitigating replay attacks
 * @param {Object | undefined} options.snarkArtifacts - Paths to the artifacts used for generating the proof. If undefined, default values will be used. It allows for file system paths and urls.
 * @param {string} options.snarkArtifacts.wasmFilePath - Path to the generated witness file
 * @param {string} options.snarkArtifacts.zkeyFilePath - Path to the generated zKey file
 */ 
export async function computeProof({secret, nullifier, publicInputs, snarkArtifacts}){
    const input = {
      //Private inputs
      secret,
      nullifier,
      //Public inputs
      ...publicInputs        
    }

    if(!snarkArtifacts){
        snarkArtifacts = {
            wasmFilePath: "circuits/compiled/circuit_js/circuit.wasm", 
            zkeyFilePath: "circuits/compiled/zkeys/circuit_final.zkey",
        }
       }

    const {proof, publicSignals} = await groth16.fullProve(
        input,
        snarkArtifacts.wasmFilePath,
        snarkArtifacts.zkeyFilePath
       )

    return {proof, publicSignals}
}
    `
}

function getVerifyProof() {
    return `/**
 * Verifies a SnarkJS proof.
 * @param verificationKey The zero-knowledge verification key.
 * @param fullProof The SnarkJS full proof.
 * @returns {boolean} True if the proof is valid, false otherwise.
 */

export function verifyProof({verificationKey, proof, publicSignals }) {
    return groth16.verify(
        verificationKey,
        publicSignals,
        proof,
    );
}
`
}

function getTests(extraPublicInputs) {
    return `
    import assert from "assert";
    import {rbigint, generateCommitmentHash, generateNullifierHash, computeProof, verifyProof} from "../lib/index";
    import fs from "fs";

    it("should create a proof", async function(){
        const secret = rbigint();
        const nullifier = rbigint();
        const commitmentHash = await generateCommitmentHash(nullifier, secret);
        const nullifierHash = await generateNullifierHash(nullifier);
        ${extraPublicInputs.map((inp) => `let ${inp} = rbigint();\n                `).join("")}
        //When compiling the tests via \`niftyzk verificationkey\` the path of the zkey used is written into a file so you don't have to adjust the tests when using different zkeys
        const zkeyPath = fs.readFileSync("circuits/compiled/vk_meta.txt", "utf-8")
        const {proof, publicSignals} = await computeProof(
            {
                secret, 
                nullifier, 
                publicInputs: {
                    commitmentHash, 
                    nullifierHash,
                    ${extraPublicInputs.join(",")}
                },
                snarkArtifacts: {             
                    wasmFilePath: "circuits/compiled/circuit_js/circuit.wasm", 
                    zkeyFilePath: zkeyPath,
                }
            })
            const verificationKeyFile = fs.readFileSync("circuits/compiled/verification_key.json", "utf-8");
            const verificationKey = JSON.parse(verificationKeyFile);
            const result = await verifyProof({verificationKey, proof, publicSignals})
            assert.equal(result, true)

            //Write the tested proof, publicSignals and verificationKey to a file. This will be used for generating tests for the cosmwasm verifier contracts.
            fs.writeFileSync("./circuits/compiled/test_proof.json", JSON.stringify({ proof, publicSignals, verificationKey }))
        })
    `
}

function getJsLib(extraPublicInputs) {
    const imports = getImports();
    const random = getRandom();
    const hashers = getHashers();
    const generateProof = getGenerateProof(extraPublicInputs);
    const verifyProof = getVerifyProof();
    return `${imports}${random}${hashers}${generateProof}${verifyProof}`
}

module.exports = { getJsLib, getTests }