import assert from "node:assert/strict";
import test from "node:test";

import { dialRecipeOpenUrl } from "./dial-repository";

test("builds Dial recipe links with the public drinks route", () => {
  assert.equal(
    dialRecipeOpenUrl({
      dialAppOrigin: "https://dialyourespresso.online",
      externalId: "lst_recipe/example",
    }),
    "https://dialyourespresso.online/drinks/lst_recipe%2Fexample",
  );
});
