//cspell:disable
import puppeteer from "puppeteer-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { END_SUB_CATEGORY, getSubLinks, START_SUB_CATEGORY } from "./utils.js";
import { delay, visitSubLinks } from "./utils.js";
import chai from "chai";

chai.should();

// Use Stealth plugin to avoid Captcha
puppeteer.default.use(stealth());

export default async function* () {
  let browser: any;

  // Adding 's' to the end of the url somehow avoids Captcha
  const baseUrl = "https://www.amazon.com/s";

  try {
    browser = await puppeteer.default.launch({
      // headless: "new",
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1920,1080",
      ],
      ignoreHTTPSErrors: true,
      executablePath: "/usr/bin/google-chrome-stable",
    });

    const page = await browser.newPage();

    // Get sublink from hamburger menu
    const linksRes = await getSubLinks(page, baseUrl);

    // Manually paginate the links
    const subLinks = linksRes.slice(1, 2);

    // wait
    delay(5000);

    // prints the number of sublinks
    console.log("Number of Links: ", subLinks.length);

    // Visits each sublink and scrapes data
    for await (const data of visitSubLinks(
      page,
      baseUrl,
      subLinks as string[]
    )) {
      // print data to console
      console.log(data);
      // yield data
      yield data;
      debugger;
      break;
    }
  } catch (err) {
    console.log("Operation failed", err);
  } finally {
    // Clean up
    await browser?.close();
  }
}
