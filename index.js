"use strict";

const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const zlib = require("zlib");
const util = require("util");
const gunzip = util.promisify(zlib.gunzip);
const readline = require("readline");
const dgram = require("dgram");

const inspectorAddr = process.env.INSPECTOR_LOGSTREAM_LISTEN_ADDR;

exports.handler = (event, context, callback) => {
  if (!inspectorAddr) {
    const err = "missing INSPECTOR_LOGSTREAM_LISTEN_ADDR env variable";
    console.log(err);
    callback(err);
    return;
  }
  console.log(`inspector addr: ${inspectorAddr}`);
  const arr = inspectorAddr.split(":");
  if (arr.length !== 2){
    callback(`invalid inspector addr format: ${inspectorAddr}. Expected host:port`);
    return;
  }

  const [inspectorHost, inspectorPort] = arr;
  const client = dgram.createSocket("udp4");

  if (event.awslogs) {
    console.log("awslogs event");
    const payload = new Buffer.from(event.awslogs.data, "base64"); // decode base64 to binary
    return gunzip(payload).then((result) => {
      const parsedRequest = JSON.parse(result.toString("utf8"));
      for (let i = 0; i < parsedRequest.logEvents.length; i++) {
        if (
          parsedRequest.logEvents[i].message.length &&
          parsedRequest.logEvents[i].message[0] === "#"
        ) {
          continue;
        }

        const current = i;
        const message = Buffer.from(parsedRequest.logEvents[i].message + "\n");
        client.send(
          message,
          0,
          message.length,
          inspectorPort,
          inspectorHost,
          (err) => {
            if (err) console.error(err);

            if (current === parsedRequest.logEvents.length - 1) {
              client.close();
              console.log(
                `sent ${parsedRequest.logEvents.length} lines for inspection`,
              );
              callback(
                null,
                `sent ${parsedRequest.logEvents.length} lines for inspection`,
              );
            }
          },
        );
      }
    });
  } else if (event.Records[0].s3) {
    const bucket = event.Records[0].s3.bucket.name;
    console.log("S3 bucket: ", bucket);
    const key = decodeURIComponent(
      event.Records[0].s3.object.key.replace(/\+/g, " "),
    );

    // Retrieve S3 Object
    const s3Client = new S3Client();
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return s3Client.send(getObjectCommand).then((response) => {
      const lineReader = readline.createInterface({
        input: response.Body.pipe(zlib.createGunzip()),
      });

      let lineCount = 0;
      let sentCount = 0;
      let last = false;

      lineReader.on("line", (line) => {
        if (line[0] !== "#") {
          const message = Buffer.from(line + "\n");

          ++lineCount;
          client.send(
            message,
            0,
            message.length,
            inspectorPort,
            inspectorHost,
            (err) => {
              if (err) console.error(err);

              ++sentCount;

              if (last && lineCount === sentCount) {
                client.close();
                console.log(`sent ${sentCount} lines for inspection`);
                callback(null, `sent ${sentCount} lines for inspection`);
              }
            },
          );
        }
      });

      lineReader.on("close", () => {
        last = true;
        console.log(`processed lines ${lineCount}`);
      });
    });
  } else {
    callback("unsupported even type");
  }
};
