const express = require("express");
const cors = require("cors");
const ethers = require("ethers");
const sqlite3 = require("sqlite3").verbose();
const campaignAbi = require("./campaignAbi");
const bodyParser = require("body-parser");

const featured = [
  "0xaf172784a2b9296a435ce0323b8fca8c8e22846f",
  "0xf3fcd9eabab8bfae1a26f2628922223171e87ef2",
  "0xA86d42Ee3599C7672b5A461f95f5e3372c977436"
];

const provider = new ethers.providers.JsonRpcProvider(
  "https://rinkeby.infura.io/v3/d456fa9795db4641a0989d8016b3414e"
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("./db.sqlite3");

db.serialize(function() {
  db.run(
    "CREATE TABLE IF NOT EXISTS campaigns (`address` TEXT NOT NULL PRIMARY KEY, data TEXT NOT NULL)"
  );
});

app.get("/campaign/:address", (req, res) => {
  const campaignAddress = req.params.address;
  db.serialize(() => {
    db.get(
      "SELECT data FROM campaigns WHERE address like ?",
      [campaignAddress],
      (error, data) => {
        if (error) {
          res.status(500);
          return res.json({ success: false, error: error.message });
        }
        if (!data) {
          res.status(404);
          return res.json({ success: false, error: "no data" });
        }
        res.json({ success: true, data: JSON.parse(data.data) });
      }
    );
  });
});

app.post("/campaign/:address", async (req, res) => {
  const campaignAddress = req.params.address;
  const campaignContract = new ethers.Contract(
    campaignAddress,
    campaignAbi,
    provider
  );
  let raiser;
  try {
    raiser = await campaignContract.getOwner();
  } catch (error) {
    res.status(404);
    res.json({
      success: false,
      message: error.message
    });
    return;
  }
  const address = ethers.utils.verifyMessage(
    JSON.stringify(req.body.data),
    req.body.signature
  );
  if (address !== raiser) {
    res.json({
      success: false,
      message: "recovered address mismatch",
      recoveredAddress: address,
      raiserAddress: raiser
    });
    res.status(403);
    return;
  }
  db.serialize(() => {
    db.get(
      "INSERT OR REPLACE INTO campaigns(address, data) VALUES(?, ?)",
      [campaignAddress, JSON.stringify(req.body.data)],
      (error, data) => {
        if (error) {
          res.status(500);
          return res.json({ success: false, error: error.message });
        }
        res.json({ success: true, ...data });
      }
    );
  });
});

app.get("/featured", async (req, res) => {
  res.json({ success: true, featured });
});

app.use("/relayer", require("./relayer"));

app.listen(8080);
