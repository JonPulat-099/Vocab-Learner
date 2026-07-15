import { describe, expect, it } from "vitest";
import { getYouglish } from "./youglish.service.js";

describe("getYouglish", () => {
  it("returns the correct deep link", async () => {
    await expect(getYouglish("feeling")).resolves.toEqual({
      link: "https://youglish.com/pron/feeling/english",
    });
  });

  it("url-encodes multi-word phrases", async () => {
    const { link } = await getYouglish("give up");
    expect(link).toBe("https://youglish.com/pron/give%20up/english");
  });
});
