// cspell:ignore sublink sublinks
import { Page } from "puppeteer-core";
import UA from "user-agents";
import chai from "chai";

chai.should();

/** Pagination */
export const START_SUB_CATEGORY = 85,
  END_SUB_CATEGORY = 10 + START_SUB_CATEGORY;
export const START_PAGE = 0,
  END_PAGE = 10 + START_PAGE;

/** Gets data from each Product page **/
export async function getData(page: Page, category: string) {
  // Definitions
  let title: string | undefined,
    imageData: { img: string; original: string | null } | undefined,
    price: number | undefined,
    description: string[] | undefined;

  {
    const [data, error] = await to(getTitle, page);
    if (error) console.error(error);
    title = data;
  }

  {
    const [data, error] = await to(getImages, page);
    if (error) console.error(error);
    if (data) imageData = data;
  }

  {
    const [data, error] = await to(getPrice, page);
    if (error) console.error(error);
    if (data) price = data;
  }

  {
    const [data, error] = await to(getDescriptions, page);
    if (error) console.error(error);
    if (data) description = data;
  }

  return { title, category, imageData, price, description };
}

/** Clicks the product image and navigates to the product page */
/** Returns true if is the last product on the page */
async function clickImage(page: Page, product_num: number, url: string) {
  const goBack = async () => {
    await delay(5_000);
    await page.goto(url!, { timeout: 100_000 });
  };
  // Clicks the product image and navigates to the product page, if failed, retry
  return retry(clickImageHelp, goBack, page, product_num);
}

/** Visit each sublink from the menu and scrape the data */
/****** Manually provide links to sub category to save resources ****/
export async function* visitSubLinks(
  page: Page,
  baseUrl: string,
  subLinks: string[]
) {
  let category: string | undefined;

  while (subLinks.length > 0) {
    // Navigate to the next URL in the subLink array
    let url = baseUrl.slice(0, baseUrl.lastIndexOf("/")) + subLinks.shift();
    await page.goto(url!, { timeout: 100_000 });

    // wait 1 second before clicking on the product image
    await delay(1000);

    // Get the category from the page
    if (category === undefined) {
      const [text, error] = await to(selectCategory, page);
      if (error) console.error(error);
      if (text) category = text;
    }

    // Keep track of product index
    let product_idx = 0;

    // paginate through the pages
    let page_idx = START_PAGE;
    while (page_idx < END_PAGE) {
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
        // yield data
        yield data;
        break;
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

  // wait for all links to load
  await delay(50_000);

  // extract the links from each product category
  return await page.$$eval(
    'a[href*="s?bbn"]',
    (links: Array<HTMLAnchorElement>) => {
      return links.map((link) => link.getAttribute("href"));
    }
  );
}

/** Wraps an async function in a try catch block */
export async function to<T, U>(
  promiseFunction: () => Promise<U>
): Promise<Awaited<[U | null, Error | null]>>;
export async function to<T, U>(
  promiseFunction: (arg: T) => Promise<U>,
  arg: T
): Promise<Awaited<[U | null, Error | null]>>;
export async function to<T, U>(
  promiseFunction: (arg: T[]) => Promise<U>,
  args: T[]
): Promise<Awaited<[U | null, Error | null]>>;
export async function to<T, U>(
  promiseFunction: (args?: T | T[]) => Promise<U>,
  args?: T[]
): Promise<Awaited<[U | null, Error | null]>> {
  try {
    // Option to pass in one argument or a list of arguments
    const data = args ? await promiseFunction(args) : await promiseFunction();
    return [data, null];
  } catch (e) {
    return [null, e];
  }
}

/** Wraps an async function in a try catch block and retries once on error */
export async function retry<T, U>(
  action: (...args: T[]) => Promise<U>,
  intermediateAction?: () => Promise<void>,
  ...args: T[]
) {
  try {
    const data = await action(...args);
    return [data, null];
  } catch (e) {
    if (intermediateAction) await intermediateAction();
    try {
      const data = await action(...args);
      return [data, null];
    } catch (e) {
      return [null, e];
    }
  }
}

const getTitle = async (page: Page) => {
  delay(10_000);
  await page.waitForSelector("img.a-dynamic-image", { timeout: 10_000 });
  return page.$eval("#productTitle", (el: any) => el.textContent!.trim());
};

export async function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function removeResizing(str: string | null) {
  return { img: str!.slice(0, str!.indexOf("._")) + ".jpg", original: str };
}

const getImages = async (page: Page) => {
  const image = await page.$eval("div.imgTagWrapper > img", (el) =>
    el.getAttribute("src")!.trim()
  );
  return removeResizing(image as string)!;
};

const selectCategory = async (page: Page): Promise<string> => {
  await page.waitForSelector("#searchDropdownBox > option[selected]", {
    timeout: 10_000,
  });
  return page.$eval("#searchDropdownBox > option[selected]", (el: any) =>
    el.textContent!.trim()
  );
};

const getPrice = async (page: Page) => {
  const price = parseFloat(
    await page.$eval(".a-price .a-offscreen", (el) =>
      el.textContent!.trim().slice(1)
    )
  );
  price.should.be.a("number");
  price.should.not.be.NaN;
  return price;
};

const getDescriptions = async (page: Page) => {
  return page.$$eval("#feature-bullets li span", (el) =>
    el.map((e) => e.textContent!.trim())
  );
};

const clickImageHelp = async (page: Page, product_num: number) => {
  await page.waitForSelector("a.a-link-normal.s-no-outline");
  const endIdx = await page.evaluate((idx: number) => {
    const elements = document.querySelectorAll("a.a-link-normal.s-no-outline");
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
  return product_num >= endIdx!;
};
