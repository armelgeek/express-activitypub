"use strict";
const express = require("express"),
  router = express.Router(),
  request = require("request"),
  crypto = require("crypto");

router.post("/sendMessage", function (req, res) {
  let db = req.app.get("db");
  let domain = req.app.get("domain");
  let acct = req.body.acct;
  let apikey = req.body.apikey;
  let message = req.body.message;
  // check to see if your API key matches
  let result = db
    .prepare("select apikey from accounts where name = ?")
    .get(`${acct}@${domain}`);
  if (result.apikey === apikey) {
    sendCreateMessage(message, acct, domain, req, res);
  } else {
    res.status(403).json({ msg: "wrong api key" });
  }
});

function signAndSend(message, name, domain, req, res, targetDomain, inbox) {
  // get the private key
  let db = req.app.get("db");
  let inboxFragment = inbox.replace("https://" + targetDomain, "");
  let result = db
    .prepare("select privkey from accounts where name = ?")
    .get(`${name}@${domain}`);
  if (result === undefined) {
    console.log(`No record found for ${name}.`);
  } else {
    let privkey = result.privkey;
    const digestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(message))
      .digest("base64");
    const signer = crypto.createSign("sha256");
    let d = new Date();
    console.log("date", d.toUTCString());
    let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digestHash}`;
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString("base64");
    let header = `keyId="https://${domain}/u/${name}",headers="(request-target) host date digest",signature="${signature_b64}"`;
    request(
      {
        url: inbox,
        headers: {
          Host: targetDomain,
          Date: d.toUTCString(),
          Digest: `SHA-256=${digestHash}`,
          Signature: header,
        },
        method: "POST",
        json: true,
        body: message,
      },
      function (error, response) {
        console.log(`Sent message to an inbox at ${targetDomain}!`);
        if (error) {
          console.log("Error:", error, response);
        } else {
          console.log("Response Status Code:", response.statusCode);
        }
      }
    );
  }
}

function createMessage(text, name, domain, req, res, follower) {
  const guidCreate = crypto.randomBytes(16).toString("hex");
  const guidNote = crypto.randomBytes(16).toString("hex");
  let db = req.app.get("db");
  let d = new Date();

  let noteMessage = {
    id: `https://${domain}/m/${guidNote}`,
    type: "Note",
    published: d.toISOString(),
    attributedTo: `https://${domain}/u/${name}`,
    content: text,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
  };

  let createMessage = {
    "@context": "https://www.w3.org/ns/activitystreams",

    id: `https://${domain}/m/${guidCreate}`,
    type: "Create",
    actor: `https://${domain}/u/${name}`,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [follower],

    object: noteMessage,
  };

  db.prepare("insert or replace into messages(guid, message) values(?, ?)").run(
    guidCreate,
    JSON.stringify(createMessage)
  );
  db.prepare("insert or replace into messages(guid, message) values(?, ?)").run(
    guidNote,
    JSON.stringify(noteMessage)
  );

  return createMessage;
}
function deleteMessage(domain, idMessage) {
  let d = new Date();
  let deleteMessage = {
    "@context": "https://www.w3.org/ns/activitystreams",
    object: `https://98b1-154-126-38-14.in.ngrok.io/m/1ca01a48965cb5567e339e2459f9da7c`,
    type: "Remove",
    actor: `https://98b1-154-126-38-14.in.ngrok.io/u/jean`,
    origin: {
      "type": "Collection",
      "name": "Sally's Notes"
    }
  };
  console.log(deleteMessage);
  return deleteMessage;
}

function sendCreateMessage(text, name, domain, req, res) {
  let db = req.app.get("db");
  let result = db
    .prepare("select followers from accounts where name = ?")
    .get(`${name}@${domain}`);
  let followers = JSON.parse(result.followers);
  console.log(followers);
  console.log("type", typeof followers);
  if (followers === null) {
    res.status(400).json({ msg: `No followers for account ${name}@${domain}` });
  } else {
    for (let follower of followers) {
      let inbox = follower + "/inbox";
      let myURL = new URL(follower);
      let targetDomain = myURL.host;
      let message = createMessage(text, name, domain, req, res, follower);
      signAndSend(message, name, domain, req, res, targetDomain, inbox);
    }
    res.status(200).json({ msg: "ok" });
  }
}
function sendDeleteMessage(name, domain, req, res) {
  let idMessage = req.body.idMessage;
  try {
    deleteMessage(domain, idMessage);
    res.status(200).json({ msg: "ok" });
  } catch (e) {
    console.log(e);
  }
}

router.post("/deleteMessage", function (req, res) {
  let domain = req.app.get("domain");
  let acct = req.body.acct;
  try {
    let msg =  sendDeleteMessage(acct, domain, req, res);
  } catch (e) {
    console.log(e);
  }
});

module.exports = router;
