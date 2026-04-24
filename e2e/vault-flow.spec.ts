/// <reference types="@wdio/mocha-framework" />
/// <reference types="webdriverio/async" />

describe("vault flow", () => {
    it("creates a vault, navigates to Addresses, and logs out", async () => {
        // First boot: no vault file on disk, LoginPage should render in
        // "Create Vault" mode. Generous timeout because the Tauri window +
        // frontend dev/bundle takes a moment to become interactive.
        await expect($("h1*=Create Vault")).toBeDisplayed({ wait: 20_000 });

        await $("input[placeholder='admin']").setValue("alice");
        const passwords = await $$("input[type='password']");
        await passwords[0].setValue("correct-horse-battery-staple");
        await passwords[1].setValue("correct-horse-battery-staple");

        await $("button*=Create Encrypted Vault").click();

        // The Portfolio page is the default landing view after unlock.
        await expect($("h1*=Portfolio")).toBeDisplayed({ wait: 10_000 });

        // Navigate to Addresses via the sidebar (the BottomNav has the same
        // label, so we scope to the <aside class="sidebar"> container).
        const sidebar = await $("aside.sidebar");
        await sidebar.$("button.sidebar-item*=Addresses").click();
        await expect($("h1*=Addresses")).toBeDisplayed();

        // Log out from the Account page.
        await sidebar.$("button.sidebar-item*=Account").click();
        await expect($("h1*=Account")).toBeDisplayed();
        await $("button*=Log Out").click();

        // With the vault now persisted to disk, the login screen should show
        // the Unlock Vault heading instead of Create Vault.
        await expect($("h1*=Unlock Vault")).toBeDisplayed({ wait: 10_000 });
    });
});
