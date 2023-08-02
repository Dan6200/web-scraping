// cspell:disable
import scrapeAmazon from "../src/amazon.js";
import { to } from "../src/utils.js";
import {
  addProductMedia,
  addProducts,
  addStore,
  createUser,
  createVendor,
  deleteUser,
} from "./utils.js";

async function populateDB() {
  try {
    const [_, err] = await to(deleteUser);
    if (err) throw new Error(err.message);

    let userId: number | null = null;
    {
      const [id, err] = await to(createUser);
      if (err) throw new Error(err.message);
      if (id) userId = id;
    }

    let vendorId: number | null = null;

    if (userId !== null) {
      const [id, err] = await to(createVendor, userId);
      if (err) throw new Error(err.message);
      if (id) vendorId = id;
    }

    let storeId: number | null = null;
    if (vendorId === null) {
      const [id, e] = await to(addStore, vendorId);
      if (e) throw new Error(e.message);
      storeId = id;
    }

    // let title: string
    //   category: string
    //   description: string[],
    //   price: number
    //   imageData: { img: string; original: string | null } | undefined;
    for await (const {
      title,
      category,
      description,
      price,
      imageData,
    } of scrapeAmazon()) {
      let productId: number | null = null;
      if (storeId !== null) {
        const [id, e] = await to(addProducts, [
          title,
          category,
          description,
          price,
          imageData,
          storeId,
          vendorId,
        ]);
        if (e) throw new Error(e.message);
        if (id) productId = id;
      }

      /** TODO: upload media image data instead of saving link **/
      if (productId !== null) {
        const [, e] = await to(addProductMedia, [productId, imageData]);
        if (e) throw new Error(e.message);
      }

      // end;
    }
  } catch (e) {
    console.log(e);
  }
}

async function main() {
  await populateDB();
}

main();
