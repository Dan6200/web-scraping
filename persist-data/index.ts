// cspell:disable
import _package from "stream-json";
const { parser } = _package;
import pkg from "stream-json/streamers/StreamArray.js";
const { streamArray } = pkg;
import db from "../db/pg/index.js";
import fs from "node:fs";
import { assert } from "chai";
import { errHandler } from "../src/supporting-funcs.js";
import CC from "currency-converter-lt";

async function populateDB() {
  debugger;
  const jsonStream = fs
    .createReadStream("data.json")
    .pipe(parser())
    .pipe(streamArray());

  let userId: number;
  try {
    userId = (
      await db.query({
        text: `INSERT INTO user_accounts (
			first_name,
			last_name,
			email,
			password,
			dob,
			country
			) values ($1, $2, $3, $4, $5, $6) RETURNING user_id`,
        values: [
          "Test",
          "Vendor",
          "populatingdb-2@gmail.com",
          "password",
          "1990-01-01",
          "Nigeria",
        ],
      })
    ).rows[0].user_id;
  } catch (e) {
    console.log(e);
    throw new Error(e.message);
  }

  let vendorId: number;
  try {
    vendorId = (
      await db.query({
        text: `INSERT INTO vendors values ($1) RETURNING vendor_id`,
        values: [userId],
      })
    ).rows[0].vendor_id;
  } catch (e) {
    console.log(e);
    throw new Error(e.message);
  }

  let storeId: number;
  try {
    storeId = (
      await db.query({
        text: `INSERT INTO stores (store_name, vendor_id) values ($1, $2) RETURNING store_id`,
        values: ["Test Store", vendorId],
      })
    ).rows[0].store_id;
  } catch (e) {
    console.log(e);
    throw new Error(e.message);
  }
  let title: string = "",
    category: string = "",
    description: string[],
    price: number = 0,
    imageData: { img: string; original: string | null } | undefined;

  for await ({
    value: { title, category, description, price, imageData },
  } of jsonStream) {
    let productId: number = 0;
    try {
      if (title && price && imageData) {
        // Covert USD to NGN with CC
        // const currencyConv = new CC({ from: "USD", to: "NGN" });
        // const priceVal = await currencyConv.convert(price);
        const priceVal = price * 750;
        assert(!isNaN(priceVal));
        productId = (
          await db.query({
            text: `INSERT INTO products (store_id, title, category, vendor_id, description, net_price, list_price, quantity_available) values ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING product_id`,
            values: [
              storeId,
              title,
              category,
              vendorId,
              JSON.stringify(description),
              priceVal,
              priceVal + Math.random() * 1001,
              Math.floor(Math.random() * 51),
            ],
          })
        ).rows[0].product_id;
      }
    } catch (e) {
      console.log(e);
      throw new Error(e);
    }

    try {
      if (productId > 0 && imageData) {
        const { img: imgUrl, original } = imageData;
        const basename = imgUrl.slice(imgUrl.lastIndexOf("/"));
        const filename =
          basename.slice(1, basename.indexOf(".")) + Math.random() * 1e7;
        await db.query({
          text: `INSERT INTO product_media (product_id, filename, filepath) values ($1, $2, $3)`,
          values: [productId, filename, imgUrl],
        });
        await db.query({
          text: `INSERT INTO product_display_image values ($1)`,
          values: [filename],
        });
      }
    } catch (e) {
      console.log(e);
      throw new Error(e.message);
    }
  }
}

populateDB();
