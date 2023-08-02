import { assert } from "chai";
import db from "../db/pg/index.js";
import CC from "currency-converter-lt";

const email = "testing-populate-db-1803@mail.com";
// Reset Test
export const deleteUser = async () => {
  await db.query({
    text: `DELETE FROM user_accounts WHERE email = $1`,
    values: [email],
  });
};

export const createUser = async (): Promise<number> => {
  const res = await db.query({
    text: `INSERT INTO user_accounts (
						first_name,
						last_name,
						email,
						password,
						dob,
						country
						) values ($1, $2, $3, $4, $5, $6) RETURNING user_id`,
    values: ["Test", "Vendor", email, "password", "1990-01-01", "Nigeria"],
  });
  if (
    res == undefined ||
    (res.rows[0] == undefined && "user_id" in res.rows[0] === false) ||
    typeof res.rows[0].user_id !== "number"
  )
    throw new Error("Error creating user");
  return res.rows[0].user_id;
};

export const createVendor = async (userId: number) =>
  (
    await db.query({
      text: `INSERT INTO vendors values ($1) RETURNING vendor_id`,
      values: [userId],
    })
  ).rows[0].vendor_id;

export const addStore = async (vendorId: number) =>
  (
    await db.query({
      text: `INSERT INTO stores (store_name, vendor_id) values ($1, $2) RETURNING store_id`,
      values: ["Test Store", vendorId],
    })
  ).rows[0].store_id;

export const addProducts = async ([
  title,
  category,
  description,
  price,
  imageData,
  storeId,
  vendorId,
]: [
  string,
  string,
  string[],
  number,
  { img: string; original: string | null } | undefined,
  number,
  number
]) => {
  if (title && price != undefined && imageData) {
    // Covert USD to NGN with CC
    const currencyConverter = new CC({ from: "USD", to: "NGN" });
    const priceVal = await currencyConverter.convert(price);
    // const priceVal = price * 750;
    assert(!isNaN(priceVal));
    const res = await db.query({
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
    });
    if (
      res == undefined ||
      res.rows[0] == undefined ||
      res.rows[0].product_id == undefined ||
      typeof res.rows[0].product_id !== "number"
    )
      throw new Error("Error creating product");
    return res.rows[0].product_id as number;
  }
};

export const addProductMedia = async ([productId, imageData]: [
  number,
  { img: string; original: string | null } | undefined
]) => {
  if (productId > 0 && imageData != undefined) {
    const { img: imgUrl } = imageData!;
    const basename = imgUrl.slice(imgUrl.lastIndexOf("/"));
    const filename =
      basename.slice(1, basename.indexOf(".") - 1) + Math.random() * 1e7;
    await db.query({
      text: `INSERT INTO product_media (product_id, filename, filepath) values ($1, $2, $3)`,
      values: [productId, filename, imgUrl],
    });
    await db.query({
      text: `INSERT INTO product_display_image values ($1)`,
      values: [filename],
    });
  }
};
