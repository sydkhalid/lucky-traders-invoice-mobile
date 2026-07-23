# Lucky Traders Invoice Mobile

Separate Expo React Native mobile app for the Lucky Traders GST invoice flow.

## Commands

```bash
npm install
npm start
npm run sync-server
npm run android
npm run ios
npm run typecheck
```

Use Expo Go or an Android/iOS simulator to run the app.

## Common Data Sync

Device data is synced through one shared local NoSQL server. Start it on the computer before opening the app on phones/tablets:

```bash
npm run sync-server
```

This app is currently configured to use:

```text
https://lucky-traders-invoice-mobile.onrender.com
```

All devices must be able to reach this URL. For local Wi-Fi/hotspot sharing, update `expo.extra.syncServerUrl` in `app.json` back to the computer IP.

## Online Sync Server on Render

The Render sync server is:

```text
https://lucky-traders-invoice-mobile.onrender.com
```

Use these Render environment variables:

```text
PORT=8095
SYNC_DATA_DIR=/data/sync-data
SYNC_API_KEY=choose-a-long-private-key
```

If `SYNC_API_KEY` is set on Render, rebuild the APK with the same key:

```powershell
$env:EXPO_PUBLIC_SYNC_SERVER_URL='https://lucky-traders-invoice-mobile.onrender.com'
$env:EXPO_PUBLIC_SYNC_API_KEY='choose-a-long-private-key'
npm run typecheck
cd android
.\gradlew.bat assembleRelease
```

## Online Sync Server on Koyeb

The same `sync-server.js` can run online with the included `Dockerfile`. For Koyeb, deploy this GitHub repository as a Dockerfile service and add a persistent Volume mounted at:

```text
/data
```

Use these Koyeb environment variables:

```text
PORT=8095
SYNC_DATA_DIR=/data/sync-data
SYNC_API_KEY=choose-a-long-private-key
```

`/health` stays public for Koyeb health checks. `/sync` and `/file` require the API key when `SYNC_API_KEY` or `LUCKY_TRADERS_SYNC_API_KEY` is set.

After Koyeb gives the app URL, rebuild the APK with the same URL and key:

```powershell
$env:EXPO_PUBLIC_SYNC_SERVER_URL='https://your-koyeb-app.koyeb.app'
$env:EXPO_PUBLIC_SYNC_API_KEY='choose-a-long-private-key'
npm run typecheck
cd android
.\gradlew.bat assembleRelease
```

The release APK will be under:

```text
android/app/build/outputs/apk/release/
```

The mobile app still keeps a local AsyncStorage cache, but it also pushes and pulls these shared tables:

```text
Users | Clients | Suppliers | Products | Purchases | Invoices | Payments | Supplier payments | Expenses | Employees | Salaries
```

Uploaded purchase PDFs and expense receipt/bill files are also synced through the shared server and restored on other devices when the document is opened or the record syncs.

## Seed Login Users

The login screen uses a local NoSQL-style user table in `src/nosqlUserTable.ts`, persisted with AsyncStorage under `lucky-traders.users.v1`.

```text
Admin: sydkhalid007 / Sydkhalid7@321
Manager: manager / manager123
```

After login the app opens the Dashboard first. Use the header menu button to open the side menu:

```text
Dashboard | Clients | Suppliers | Purchases | Inventory | Supplier Pay | Invoices | Payments | Reports | Documents | Expenses | Employees | Users | Account
```

The Account menu supports:

```text
View profile | Change password
```

The Users menu is available for admin accounts and supports:

```text
Add manager users | View user accounts
```

The Dashboard reads current local data from saved clients and invoices:

```text
Client count | Invoice count | Invoice value | Today report | Recent invoices
```

The Reports menu shows business-year sales, purchase stock, sold stock, stock left, estimated stock value, sales averages with and without GST, purchase summary, supplier payable summary, collection summary, expense summary, estimated gross/net profit, GST totals, and GST ledger totals for GST collected, GST paid, payable GST, and credit ledger GST.

The Inventory menu tracks product master and stock from purchases and invoices:

```text
Add product | Edit product | Product master | Purchase qty | Sold qty | Stock left | Stock value | Low/negative stock alerts
```

The Supplier Pay menu tracks purchase bill payments and payable balances locally:

```text
Add supplier payment | Partial payment | Purchase bill balance | Payable suppliers | Supplier ledger | Edit/delete payment
```

The Payments menu tracks invoice receipts and pending balances locally:

```text
Add receipt | Partial payment | Invoice balance | Pending clients | Receipt ledger | Edit/delete receipt
```

The GST Filing menu summarizes filing-ready GST values:

```text
GSTR-1 sales summary | GSTR-3B summary | GST collected | GST paid | Input credit | Payable GST | Credit ledger | HSN sales summary
```

The Documents menu gathers business documents in one place:

```text
Invoices | Purchase PDFs | Expense bills | Offer letters | Salary slips | Open/share document | Missing file status
```

The Expenses menu stores expense bills locally with receipt references:

```text
Add expense | Upload receipt/bill | Edit expense | Open receipt | Delete expense | Expense summary
```

The Employees menu stores employee and salary data locally:

```text
Add employee | Bank details | Offer letter PDF with logo/signature | Add salary | Edit salary | Salary slip PDF | Salary ledger | Payroll summary
```

## File Structure

`App.tsx` is now only the root state and navigation shell. Pages and shared code are split under `src`:

```text
src/screens/LoginScreen.tsx
src/screens/DashboardScreen.tsx
src/screens/ClientsScreen.tsx
src/screens/SuppliersScreen.tsx
src/screens/PurchasesScreen.tsx
src/screens/InventoryScreen.tsx
src/screens/SupplierPaymentsScreen.tsx
src/screens/InvoicesScreen.tsx
src/screens/PaymentsScreen.tsx
src/screens/ReportsScreen.tsx
src/screens/GstFilingScreen.tsx
src/screens/DocumentsScreen.tsx
src/screens/ExpensesScreen.tsx
src/screens/EmployeesScreen.tsx
src/screens/UsersScreen.tsx
src/screens/InvoiceWorkflowScreen.tsx
src/screens/AccountScreen.tsx
src/components/common.tsx
src/components/InvoiceBillPreview.tsx
src/invoiceCore.ts
src/syncClient.ts
src/nosqlProductTable.ts
src/nosqlEmployeeTable.ts
src/nosqlExpenseTable.ts
src/nosqlPaymentTable.ts
src/nosqlSupplierPaymentTable.ts
src/styles.ts
src/types.ts
sync-server.js
```

## Client Database

Seed clients are stored in `src/nosqlClientTable.ts`. Client add/edit data is persisted locally with AsyncStorage under the NoSQL key `lucky-traders.clients.v1`.

The Clients menu supports:

```text
Add client | Edit client | List clients | Use client for invoice
```

## Supplier Database

Suppliers are stored locally with AsyncStorage under the NoSQL key `lucky-traders.suppliers.v1`.

The Suppliers menu supports:

```text
Import supplier PDF | Add supplier | Edit supplier | List suppliers | Delete supplier
```

PDF import uses the device file picker and reads supplier details from selectable PDF text when available. It supports normal generated invoice PDFs, Flate-compressed PDF text, and embedded ToUnicode font maps used by supplier invoices such as Inframat and Fab Pipes. Scanned/image-only PDFs can be uploaded, but the supplier fields must be checked and entered manually.

## Purchase Database

Purchase invoices are stored locally with AsyncStorage under the NoSQL key `lucky-traders.purchases.v1`.

The Purchases menu supports:

Upload purchase PDF | Preview extracted fields | Show parsing errors | Auto-read supplier | Save purchase invoice | Edit purchase | Keep reference PDF | List purchases | Delete purchase

Purchase PDF import currently targets the supplier invoice formats used by Inframat Alloys Pvt. Ltd. and FAB PIPES AND TUBES. Uploading a purchase shows a preview first, flags missing key fields, and only saves after confirmation. Saved purchases can be edited without losing the uploaded PDF reference. Saving or updating a purchase also creates or updates the supplier record using GSTIN, phone, email, or supplier name matching. A copy of the uploaded PDF is stored locally with the purchase record for later reference.

Purchase quantities are shown in Kg. Uploaded supplier PDFs that use MTS are converted to Kg, with the item rate converted to per-Kg for consistent reports and editing.

## Expense Database

Expense bills are stored locally with AsyncStorage under the NoSQL key `lucky-traders.expenses.v1`.

The Expenses menu supports:

```text
Add expense | Date picker | Category/vendor/details | GST paid | Payment mode | Upload bill/receipt | Edit expense | Open receipt | Delete expense
```

Uploaded receipt or bill files are copied into local app storage and kept with the expense record for later reference.

## Invoice Numbering

Invoice numbers are generated automatically starting at:

```text
#LT001
```

Saved invoices are stored locally with AsyncStorage under `lucky-traders.invoices.v1`, and the next invoice number is stored under `lucky-traders.invoiceSequence.v1`. Pressing `Save Next`, `Print`, or `Share PDF` saves the current invoice and prepares the next number automatically.

The PDF invoices `#LS004` for KUMUTHA PLASTIC INDUSTRIES, `#LT005` for Prince Mathiyalagan, `#LT006` for AARADHANA TRADERS, `#LT007`/`#LT008` for Three Star Steels And Bottles, `#LT009` for NEW HINDUSTAN STEELS AND HARDWARES, `#LT010` for HINDUSTAN STEELS & CEMENT, and legacy Golden Steel invoices `#GS-019-KRI` through `#GS-024-KRI` are imported once into the saved invoice list from `src/nosqlInvoiceTable.ts`.

Invoice Date, E-Way Bill Date, and Valid Upto use the native mobile date picker. Invoice Date and E-Way Bill Date default to today's date, while Valid Upto defaults to tomorrow.

The final Preview, Print, and Share PDF output use the bill-style layout with logo/header, From/To blocks, product table, tax summary, amount in words, E-Way section, bank details, and signature block.

Saved invoices can be managed from the `Invoices` side menu item. Use `Add Invoice` from that list to open the invoice form. Saved invoice preview shows the full bill layout and includes Print and Share PDF actions:

```text
Preview full invoice | Print | Share PDF | Edit invoice | Delete invoice
```
