let secrets = {};
try {
  secrets = require("./secrets").secrets; // create your secrets.js file using the template
} catch {
  console.log("You need to setup frontend/src/utils/secrets.js using the secrets.template.js file");
  alert("You need to setup frontend/src/utils/secrets.js using the secrets.template.js file");
}

const algosdk = require("algosdk");

// 
// This will handle all algosdk, indexer, and AlgoSigner code
class AlgoHandler {
  constructor() {
    // Waits a little while then checks to see if the AlgoSigner extension is installed
    setTimeout(200, () => {
      if (typeof window.AlgoSigner == "undefined") {
        console.log("Please install the AlgoSigner extension");
        alert("Please install the AlgoSigner extension");
        return;
      }
    });

    // Setup the algod client using the secrets imported variable
    // TODO -----------------------------------------------------------------------------
    this.algodClient = new algosdk.Algodv2(secrets.algodHeader, secrets.algodServer, "");

    // Setup the indexer client using the secrets imported variable
    // TODO -----------------------------------------------------------------------------
    this.indexerClient = new algosdk.Indexer(secrets.algodHeader, secrets.indexerServer, "");
  }

  /**
   * Attempts to connect to the accounts present in the browser's AlgoSigner addon.
   *
   * @returns {string[]} - array of all account addresses in string format.
   */
  async getAlgoSignerAccounts() {
    // This variable will be returned after populated
    let accounts = [];

    // Attempt to connect to AlgoSigner, note you will have to use the "await" keyword

    
    try { 
      await window.AlgoSigner.connect(); //is window necessary 
    } catch (err) {     // If this fails or an error occurs, return an empty array
      return []
    }

    // Retrieve all the AlgoSigner accounts on the TestNet
    let accountss = await window.AlgoSigner.accounts({ ledger: 'TestNet' });
    Array.from(accountss).forEach(obj => { 
      accounts.push(obj.address)
    })
    // Note they may be in this format: [{address: "address1"}, {address: "address2"}, etc]
    // Return the addresses in array format: ["address1", "address2", "address3", etc]
    return accounts;
  }

  /**
   * Decodes base64 string to JavaScript standard string.
   * 
   * @param {string} encodedString - string encoded in base64
   * @returns {string} - regular JavaScript string 
   */
  base64ToString(encodedString) {
    return Buffer.from(encodedString, "base64").toString();
  }

  /**
   * Retrieves and returns the last Algorand TestNet round
   * @returns {Number} - the last Algorand TestNet round
   */
  async getLatestRound() {
    // Retrieve the algod client status
    let status = (await this.algodClient.status().do());
    console.log("Algorand network status: %o", status)
    // Return the "last-round" value from that status
    // TODO -----------------------------------------------------------------------------
    return status['last-round'];
  }

  /** 
   * Retrieves and returns the current global variable values in the given app (appID).
   *
   * @param {number} appID - App ID (aka index) of the Algorand smart contract app.
   * @returns {object} - Javascript object of election variables mapped to their respective values.
   * 
   * @example 
   * // returns 
   * //   {
   * //     "Creator": "fjlasjfskfa...",
   * //     "VoteOptions": "A,B,C,D",
   * //     "VotesFor0": 0,
   * //     "VotesFor1": 0,
   * //     ...
   * //   } 
   * getElectionState(appID)
   */
  async getElectionState(appID) {
    // newState will be returned once it's filled with data
    let newState = {};

    // Use the algodClient to get the the app details
    // TODO -----------------------------------------------------------------------------
    let app = {};
    app = await this.algodClient.getApplicationByID(appID).do()

    // The data might have a complex structure, feel free to console.log it to see the structure

    // Go through the data and add the global state variables and values to our newState object (dictionary)
    console.log("Application's global state:");
    for (let x of app["params"]["global-state"]) {
      console.log(x);

      // Decode the object key
      let key = this.base64ToString(x["key"]);

      // Bytes values need to be decoded
      // Addresses stored as bytes need a special decoding process which we have done for you :)
      let bytesVal = this.base64ToString(x["value"]["bytes"]);
      
      // uint types don't need to be decoded
      let uintVal = x["value"]["uint"];

      // Type is 1 if the variable is the bytes value, 2 if the variable is actually the uint value
      let valType = x["value"]["type"];

      // set the value for the key in our newState object to the correct value
      newState[key] = valType == 1 ? bytesVal : uintVal;
    }

    // Add the creator's address
    newState["Creator"] = app["params"]["creator"];

    // return the newState
    return newState;
  }

  /** 
   * Finds all accounts that have opted-in to the specified app and returns their local states.
   *
   * @param {number} appID - App ID (aka index) of the Algorand smart contract app.
   * @returns {object} - Object of addresses mapped to an object of the addresses' key-value 
   * local state.
   * 
   * @example 
   * // returns 
   * //   {
   * //     "jsdalkfjsd...": {
   * //       "can_vote": "yes", 
   * //       "voted": 2
   * //     }, 
   * //     "fdsfdsaf...": {
   * //       "can_vote": "no"
   * //     }
   * //   }
   * getAllLocalStates(appID)
   */
  async getAllLocalStates(appID) {
    // allLocalStates will be returned once it's filled with data
    let allLocalStates = {};

    // Use this.indexerClient to find all the accounts who have appID associated with their account
    // TODO -----------------------------------------------------------------------------
    let accountInfo = await this.indexerClient.searchAccounts().applicationID(appID).do();
    Array.from(accountInfo.accounts).forEach(acc => { 
      Array.from(acc['apps-local-state']).forEach(mini => { 
        if (mini.id == appID) { 
          allLocalStates[acc['address']] = {}
          Array.from(mini['key-value']).forEach(kv => { 
            let key = this.base64ToString(Object.values(kv)[0])
            let value;
            key === "can_vote" ? value = this.base64ToString(Object.values(kv)[1].bytes) : value = Object.values(kv)[1].uint
            allLocalStates[acc['address']][key] = value
          })
        }
      })
    })
    console.log(allLocalStates, '----------------\n', accountInfo)
    //CHECK how to test this! AND HOW to do console.log with this
    // The resultant JavaScript object (dictionary) may have a complex structure
    // Try to console.log it out to see the structure

    // Go through the data and fill allLocalStates to contain all the users' local states
    // Note that the *keys* of smart contract local state variables will need to be decoded using 
    // our this.base64ToString(value) function
    // The actual values will also need to be decoded if they are bytes
    // If they are uints they do not need decoding
    // TODO -----------------------------------------------------------------------------
    return allLocalStates;
  }

  /** 
   * Signs the given transaction using AlgoSigner then sends it out to be added to the blockchain.
   *
   * @param {AlgoSDK Transaction} txn - Transaction that needs to be signed and sent.
   */
  async signAndSend(txn) {
    // Transactions will need to be encoded to Base64. AlgoSigner has a builtin method for this
    // TODO -----------------------------------------------------------------------------
    let binaryTx = txn.toByte();
    let base64Tx = window.AlgoSigner.encoding.msgpackToBase64(binaryTx);
    // Sign the transaction with AlgoSigner
    // TODO -----------------------------------------------------------------------------
    let signedTxs = await window.AlgoSigner.signTxn([
      {
        txn: base64Tx,
      },
    ]);

    // Send the message with AlgoSigner
    // TODO -----------------------------------------------------------------------------
    let binarySignedTx = window.AlgoSigner.encoding.base64ToMsgpack(signedTxs[0].blob); //convert or not? 
    await this.algodClient.sendRawTransaction(binarySignedTx).do();
  //   await window.AlgoSigner.send({
  //     ledger: LEDGER_NAME,
  //     tx: signedTxs,
  // });
  }

  /** 
   * Sends a transaction that opts in the given account to the given app.
   *
   * @param {string} address - Address of the user who wants to opt into the election.
   * @param {number} appID - App ID (aka index) of the smart contract app.
   */
  async optInAccount(address, appID) {
    // Get the suggested params for the transaction
    // TODO -----------------------------------------------------------------------------
    let params = await this.algodClient.getTransactionParams().do();
    // Create the transaction to opt in
    // TODO -----------------------------------------------------------------------------
    let txn = algosdk.makeApplicationOptInTxn(address, params, appID);
    // Sign and send the transaction with our this.signAndSend function
    // TODO -----------------------------------------------------------------------------
    this.signAndSend(txn)
  }

  /** 
   * Sends a transaction from the creator to the given app to approve/reject the given user.
   *
   * @param {string} creatorAddress - Address of the creator, who is allowed to approve/reject.
   * @param {string} userAddress - Address of the user who is being approved/rejected.
   * @param {string} yesOrNo - "yes" or "no" corresponding to whether user should be allowed to vote 
   * or not.
   * @param {number} appID - App ID (aka index) of the smart contract app.
   */
  async updateUserStatus(creatorAddress, userAddress, yesOrNo, appID) {
    // Get the suggested params for the transaction
    // TODO -----------------------------------------------------------------------------
    let params = await this.algodClient.getTransactionParams().do();
    // Setup the application argument array, note that application arguments need to be encoded
    // Strings need to be encoded into Uint8Array
    // Addresses, *only* when passed as *arguments*, need to be decoded with algosdk inbuilt 
    // decodeAddress function and have their public key value used
    // The first argument should be the identifier of the smart contract method.
    // In this case the identifier is "update_user_status"
    // TODO -----------------------------------------------------------------------------
    let method_identifier = "update_user_status"
    let app_args = [
      new Uint8Array(method_identifier),
      new Uint8Array(algosdk.decodeAddress(userAddress)),
      new Uint8Array(Buffer.from(yesOrNo))
    ]
    // Create the transaction with proper app argument array
    // For this application transaction make sure to include the optional array of accounts 
    // including both the creator's account and also the user's account 
    // (both in regular string format, algosdk automatically converts these when used this way)
    // TODO -----------------------------------------------------------------------------
    let txn = algosdk.makeApplicationNoOpTxn(creatorAddress, params, appID, app_args, [creatorAddress, userAddress])
    // Sign and send the transaction with our this.signAndSend function
    // TODO -----------------------------------------------------------------------------
    this.signAndSend(txn)
  }

  /** 
   * Sends a transaction from the given user to vote for the given option in the given election app.
   *
   * @param {string} address - Address of the user trying to vote.
   * @param {number} optionIndex - Index (starting at 0) corresponding to the user's vote, 
   * ie in "A,B,C" the optionIndex for C would be index 2.
   * @param {number} appID - App ID (aka index) of the smart contract app.
   */
  async vote(address, optionIndex, appID) {
    // The first argument should be the identifier of the smart contract method.
    // In this case the identifier is "vote"
    // TODO -----------------------------------------------------------------------------
    let params = await this.algodClient.getTransactionParams().do();
    let method_identifier = "vote"
    let app_args = [
      new Uint8Array(method_identifier),
      algosdk.encodeUint64(optionIndex)
    ]
    let txn = algosdk.makeApplicationNoOpTxn(address, params, appID, app_args) //CHECK SHOULD I USE NOOP
    this.signAndSend(txn)
  }

  /** 
   * Sends a transaction from given account to close out of the given app.
   *
   * @param {string} address - Address of the user trying to close out.
   * @param {number} appID - App ID (aka index) of the smart contract app.
   */
  async closeOut(address, appID) {
    // TODO -----------------------------------------------------------------------------
    let params = await this.algodClient.getTransactionParams().do();
    let app_args = []
    let txn = algosdk.makeApplicationNoOpTxn(address, params, appID, app_args)
    this.signAndSend(txn)
  }

  /** 
   * Sends a transaction from the given user to the given app to clear state of the app.
   *
   * @param {string} address - Address of the user trying to clear state.
   * @param {number} appID - App ID (aka index) of the smart contract app.
   */
  async clearState(address, appID) {
    // TODO -----------------------------------------------------------------------------
    let params = await this.algodClient.getTransactionParams().do();
    let app_args = []
    let txn = algosdk.makeApplicationNoOpTxn(address, params, appID, app_args)
    this.signAndSend(txn)
  }
}

// create and export a singular AlgoHandler instance
const mainAlgoHandler = new AlgoHandler();

export default mainAlgoHandler;
