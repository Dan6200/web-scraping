import { Page } from "puppeteer-core";
import UA from "user-agents";
import chai from "chai";

chai.should();

export async function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function removeResizing(str: string | null) {
  return { img: str!.slice(0, str!.indexOf("._")) + ".jpg", original: str };
}

/** Gets data from each Product page **/
export async function getData(page: Page, category: string) {
  // Definitions
  let title: string | undefined,
    imageData: { img: string; original: string | null } | undefined,
    price: number | undefined,
    description: string[] | undefined;

  {
    const error = (await errHandler(async () => {
      delay(10_000);
      await page.waitForSelector("img.a-dynamic-image", { timeout: 10_000 });
      title = await page.$eval("#productTitle", (el: any) =>
        el.textContent!.trim()
      );
    }))![1];
    if (error) console.error(error);
  }

  {
    const error = (await errHandler(async () => {
      const image = await page.$eval("div.imgTagWrapper > img", (el) =>
        el.getAttribute("src")!.trim()
      );
      imageData = removeResizing(image as string)!;
    }))![1];
    if (error) console.error(error);
  }

  {
    const error = (await errHandler(async () => {
      price = parseFloat(
        await page.$eval(".a-price .a-offscreen", (el) =>
          el.textContent!.trim().slice(1)
        )
      );
      price.should.be.a("number");
      price.should.not.be.NaN;
    }))![1];
    if (error) console.error(error);
  }

  {
    const error = (await errHandler(async () => {
      description = await page.$$eval("#feature-bullets li span", (el) =>
        el.map((e) => e.textContent!.trim())
      );
    }))![1];
    if (error) console.error(error);
  }

  return { title, category, imageData, price, description };
}

/** Clicks the product image and navigates to the product page */
/** Returns true if is the last product on the page */
async function clickImage(page: Page, product_num: number, url: string) {
  const STOP = 50;
  return retryHandler(
    // Action:
    // Clicks the product image and navigates to the product page
    async () => {
      // debugger;
      await page.waitForSelector("a.a-link-normal.s-no-outline");
      const endIdx = await page.evaluate((idx: number) => {
        const elements = document.querySelectorAll(
          "a.a-link-normal.s-no-outline"
        );
        if (elements[idx]) {
          const element = elements[idx];
          const event = new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true,
          });
          element.dispatchEvent(event);
        }
        return elements.length;
      }, product_num);
      // If product is the last product on the page, return true
      return product_num >= endIdx! || product_num >= STOP;
    },
    // Intermediary action before retrying:
    // Goes back to the previous page then tries again
    async () => {
      await delay(5_000);
      await page.goto(url!, { timeout: 100_000 });
    }
  );
}

/** Visit each sublink from the menu and scrape the data */
export async function* visitSubLinks(
  page: Page,
  baseUrl: string,
  subLinks: string[]
) {
  let category: string | undefined;

  while (subLinks.length > 0) {
    // Navigate to the next URL in the subLink array
    let url = baseUrl.slice(0, baseUrl.indexOf("/s")) + subLinks.shift();
    await page.goto(url!, { timeout: 100_000 });

    // wait 1 second before clicking on the product image
    await delay(1000);

    // Get the category from the page
    if (category === undefined) {
      const error: Error = (await errHandler(async () => {
        await page.waitForSelector("#searchDropdownBox > option[selected]", {
          timeout: 10_000,
        });
        category = await page.$eval(
          "#searchDropdownBox > option[selected]",
          (el: any) => el.textContent!.trim()
        );
      }))![1];
      if (error) console.error(error);
    }
    console.log("category: ", category);

    // Keep track of product index
    let product_idx = 0;
    // Keep track of page index
    let page_idx = 0;
    while (true) {
      let endOfPage: boolean | undefined;
      try {
        // print page number
        console.log("page: ", page_idx + 1);
        // print product number
        console.log("product: ", product_idx + 1);

        // wait
        await delay(4000);

        // click on the product image and navigate to the product page
        // If product is the last product on the page, return true
        const result = await clickImage(page, product_idx, url!);
        // set the endOfPage variable if it is last on page
        endOfPage = result[0];

        // If product is the last product on the page, go to the next page
        if (endOfPage === true) {
          // Go to next page
          await page.$eval("a.s-pagination-button", (el) => el.click());
          // wait
          await delay(5_000);
          // Update url
          url = page.url();
          // Update page count
          page_idx++;
          // Reset product count
          product_idx = 0;
          // click on product
          const res = await clickImage(page, product_idx, url!);
          // reassign endOfPage variable, if it is last on the new page
          endOfPage = res[0];
          // if endOfPage is still true, then break out of the loop
          if (endOfPage === true) break;
          const err = res[1];
          if (err) console.error(err);
        }

        // Wait for high-res images to load
        await delay(5_000);
        // If there is an error, print it
        const err = result[1];
        if (err) console.error(err);

        // wait 5 seconds before going to the next item
        await delay(5_000);
      } catch (e) {
        console.error(e);
      } finally {
        // Retrieve data from page
        const data = await getData(page, category!);
        // return data
        yield data;
        // wait 5 seconds before going to the next item
        await delay(5_000);
      }

      // Go back to the products page
      await page.goto(url!, { timeout: 100_000 });
      product_idx++;
    }
  }
}

/** Scrape the sublinks from the hamburger menu */
export async function getSubLinks(page: Page, baseUrl: string) {
  // Set user agent to prevent Amazon from blocking the request
  await page.setUserAgent(UA.toString());

  await page.evaluate(() => {
    window.onbeforeunload = null;
  });

  // Go to amazon.com
  await page.goto(baseUrl, { timeout: 100_000 });

  // Wait for the hamburger menu to load
  await page.waitForSelector("#nav-hamburger-menu", { timeout: 100_000 });
  // wait 2 seconds before hovering over the hamburger menu
  await delay(2000);
  // Hover over the hamburger menu before clicking on it
  await page.hover("#nav-hamburger-menu");
  await delay(500);
  // Click on the hamburger menu
  await page.click("#nav-hamburger-menu");
  // Wait 5 seconds
  await delay(5_000);

  // Wait for the links to the product categories to load
  await page.waitForSelector('a[href*="s?bbn"]', { timeout: 100_000 });

  // extract the links from each product category
  return await page.$$eval(
    'a[href*="s?bbn"]',
    (links: Array<HTMLAnchorElement>) =>
      links.map((link) => link.getAttribute("href"))
  );
}

/** Wraps an async function in a try catch block */
export async function errHandler(
  promiseFunction: (args: any[]) => Promise<any>,
  ...args: any[]
) {
  try {
    const data = await promiseFunction(args);
    return [data, null];
  } catch (e) {
    return [null, e];
  }
}

/** Wraps an async function in a try catch block and retries once on error */
export async function retryHandler(
  action: (args: any[]) => Promise<any>,
  intermediateAction?: (args: any[]) => Promise<any>,
  ...args: any[]
) {
  try {
    const data = await action(args);
    return [data, null];
  } catch (e) {
    if (intermediateAction) await intermediateAction(args);
    try {
      const data = await action(args);
      return [data, null];
    } catch (e) {
      return [null, e];
    }
  }
}
