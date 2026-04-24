import { $, $$, browser } from "@wdio/globals";

describe("vault flow", () => {
    it("creates a vault, navigates to Addresses, and logs out", async () => {
        // First boot: wait for the login heading to exist, then wait until it
        // settles into "Create Vault" (LoginPage starts with vaultExists=null
        // which renders "Unlock Vault" briefly until get_vault_status resolves).
        const heading = $("h1.login-title");
        await heading.waitForExist({ timeout: 30_000 });
        await browser.waitUntil(async () => (await heading.getText()).includes("Create Vault"), {
            timeout: 20_000,
            timeoutMsg: `LoginPage never entered Create Vault mode (heading text was "${await heading.getText()}")`,
        });

        await $("input[placeholder='admin']").setValue("alice");
        const passwords = await $$("input[type='password']");
        await passwords[0].setValue("correct-horse-battery-staple");
        await passwords[1].setValue("correct-horse-battery-staple");

        await $("button*=Create Encrypted Vault").click();

        // Portfolio page is the default landing view after unlock.
        await $("h1*=Portfolio").waitForDisplayed({ timeout: 15_000 });

        // Navigate to Addresses via the sidebar (the BottomNav has the same
        // label, so we scope to the <aside class="sidebar"> container).
        const sidebar = await $("aside.sidebar");
        await sidebar.$("button.sidebar-item*=Addresses").click();
        await $("h1*=Addresses").waitForDisplayed();

        // Log out from the Account page.
        await sidebar.$("button.sidebar-item*=Account").click();
        await $("h1*=Account").waitForDisplayed();
        await $("button*=Log Out").click();

        // With the vault now persisted to disk, the login screen should show
        // the Unlock Vault heading instead of Create Vault.
        await browser.waitUntil(async () => (await heading.getText()).includes("Unlock Vault"), {
            timeout: 15_000,
            timeoutMsg: "LoginPage never returned to Unlock Vault mode after logout",
        });
    });
});
