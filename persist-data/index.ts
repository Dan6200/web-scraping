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
    const [, err] = await to(deleteUser);
    if (err) throw new Error(err);

    let userId: number;
    {
      const [id, err] = await to(createUser);
      if (err) throw new Error(err.message);
      userId = id;
    }

    let vendorId: number;
    {
      const [id, err] = await to(createVendor, userId);
      if (err) throw new Error(err.message);
      vendorId = id;
    }

    let storeId: number;
    {
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
      let productId: number = 0;
      {
        const [, e] = await to(addProducts, [
          title,
          category,
          description,
          price,
          imageData,
          storeId,
          vendorId,
        ]);
        if (e) throw new Error(e.message);
      }

      {
        const [, e] = await to(addProductMedia, [productId, imageData]);
        if (e) throw new Error(e.message);
      }

      // end;
    }
  } catch (e) {
    console.log(e);
  }
}

populateDB();
