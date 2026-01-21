export interface TutorialScreenshot {
  image: string;
  mobileImage?: string;
  description: string;
  title?: string;
  requiredPermissions?: string[];
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  screenshots: TutorialScreenshot[];
  requiredPermissions: string[];
}

export const TUTORIAL_CONFIG: Record<string, Tutorial[]> = {
  '/inventory': [
    {
      id: 'inventoryOverview',
      title: 'Inventory Overview',
      description: 'Learn the inventory management interface',
      requiredPermissions: ['page.inventory.view'],
      screenshots: [
        // TUTORIAL STEP PERMISSIONS GUIDE:
        // Add requiredPermissions array to each screenshot to control visibility based on user permissions
        // Example: requiredPermissions: ['page.inventory.view', 'inventory.add']
        // If no permissions specified, step is visible to all users who can access the tutorial
        {
          title: 'Inventory Header',
          image: 'https://r2.fivemanage.com/image/XURROrrf5rn9.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the page header',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Logo, Page Title, Welcome',
          image: 'https://r2.fivemanage.com/image/nMStCMbWnKmT.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'You can click/tap the logo to return to the home page.',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Search Bar, Logout button, and Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/HtaI7uEZcpQ2.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'For mobile, click the dropdown menu button to view the Search and Logout functions. You can use the search bar to search inventory using either Brand Name or Item Name, and the Logout button to logout of the site.',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/AdjDEKYfFTrZ.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The dropdown menu shows the current page, and also allow you to navigate to other pages of the site',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Item Details Section',
          image: 'https://r2.fivemanage.com/image/fUH4Er2qiYKs.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Item Details section where you can view the details of an item.',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Item Details Section: Expanded',
          image: 'https://r2.fivemanage.com/image/WTdj6rrgeJLy.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: "Clicking on a row in the Current Inventory table shows that item's details here.",
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Current Inventory Section',
          image: 'https://r2.fivemanage.com/image/59Gw3xoE449A.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Current Inventory section',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/trC5nhIM4t0a.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Action Bar. Open the Action Bar tutorial to explore its functions.',
          requiredPermissions: ['page.inventory.view'],
        },
        {
          title: 'Current Inventory Table',
          image: 'https://r2.fivemanage.com/image/nL5uxbMaP7Mn.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: "This table shows the inventory of products. You can freely add/edit/remove text from the Remarks field and they'll be added to the items's details automatically.",
          requiredPermissions: ['page.inventory.view'],
        },
      ],
    },
    {
      id: 'inventoryActionBar',
      title: 'Action Bar',
      description: 'Explore the Action Bar',
      requiredPermissions: ['page.inventory.view'],
      screenshots: [
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/trC5nhIM4t0a.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the Action Bar',
        },
        {
          title: 'Export to CSV',
          image: 'https://r2.fivemanage.com/image/UMPT4zu3aOZ9.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The export button allows you to export the currently shown inventory items to be exported to a CSV file.',
        },
        {
          title: 'Select Mode',
          image: 'https://r2.fivemanage.com/image/bO77FPSmotxa.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Select mode allows you to select multiple items in the table for an action. Open the Select Mode tutorial to explore its functions.',
        },
        {
          title: 'Filters and Clear Filters',
          image: 'https://r2.fivemanage.com/image/sImyAnjo1vsz.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters button opens the Filters section which filters the shown inventory items. The Clear Filters button clears all the manually set filters.',
        },
        {
          title: 'Filters Section',
          image: 'https://r2.fivemanage.com/image/aRpIcZNIvhFw.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters section contains all the filters that can be used to control which inventory items are shown on the table.',
        },
      ],
    },
  ],
  '/transactions/new': [
    {
      id: 'newTransaction',
      title: 'Creating a New Transaction',
      description: 'Learn the complete transaction workflow',
      requiredPermissions: ['page.newtransaction.view', 'transactions.create'],
      screenshots: [
        {
          title: 'Customer Information',
          image: 'https://r2.fivemanage.com/image/fdjTP3Fnbtnx.jpg',
          mobileImage: 'https://i.imgur.com/tx-customer-mobile.jpg',
          description: 'Enter customer details including name, contact number, and email. This information will be saved for future transactions. "Required" fields can be modified in the Settings page, by users with permission.',
        },
        {
          title: 'Selecting an existing customer',
          image: 'https://r2.fivemanage.com/image/xZxAzOJfDylL.jpg',
          mobileImage: 'https://i.imgur.com/tx-items-mobile.jpg',
          description: 'Select an existing customer by clicking the button next to the name field. This will open a popup that shows the customer list, which you can select from by pressing the Select button on the right.',
        },
        {
          title: 'Staff Assignment',
          image: 'https://r2.fivemanage.com/image/iCEBxwHc9eBw.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: 'Select the staff member who will be handling the transaction. Their initials will be used in the Transaction ID.',
        },
        {
          title: 'Adding Items to the Transaction',
          image: 'https://r2.fivemanage.com/image/Qjq6qQE2Nft1.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: 'Here are the lists of the available products and services. You can search for an item using the individual search bars, or pick one from the list below. You can click the "Show all" text to view all items.',
        },
        {
          title: 'Order Summary',
          image: 'https://r2.fivemanage.com/image/Mbc2uEUgHJxY.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: 'On mobile, tap the cart icon to view the Order Summary section. This section shows the item(s) in the order, and also allows transaction-specific individual item discount or markup to be modified.',
        },
        {
          title: 'Review Order',
          image: 'https://r2.fivemanage.com/image/lq6pJLSo7UvZ.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: 'Here you can review the transaction.',
        },
        {
          title: 'Payment',
          image: 'https://r2.fivemanage.com/image/IdySDFafguPK.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: 'This section is where you select which payment method is used by the customer. For cash, you need to input the amount given, and toggle the "Change given to customer" switch to proceed. For Gcash, you need to input the Gcash Reference Number to proceed.',
        },
        {
          title: 'Completion',
          image: 'https://r2.fivemanage.com/image/OpOtL48eSjeL.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: '"Mark as Pending" allows you to save the incomplete transaction. "Mark as Complete" completes the transaction and shows you a summary of the completed transaction',
        },
      ],
    },
  ],
  '/transactions': [
    {
      id: 'transactionsOverview',
      title: 'Transactions Page Overview',
      description: 'A brief introduction to the page',
      requiredPermissions: ['page.transactions.view'],
      screenshots: [
        {
          title: 'Transactions Header',
          image: 'https://r2.fivemanage.com/image/Hj9vU09EokAe.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the page header',
        },
        {
          title: 'Logo, Page Title, Welcome',
          image: 'https://r2.fivemanage.com/image/sGkmQozloehr.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'You can click/tap the logo to return to the home page.',
        },
        {
          title: 'Search Bar, Logout button, and Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/wMKjuGwIpJud.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'For mobile, click the dropdown menu button to view the Search and Logout functions. You can use the search bar to search transactions using either Customer Name or Transaction ID, and the Logout button to logout of the site.',
        },
        {
          title: 'Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/pe5hkv0wsB5K.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The dropdown menu shows the current page, and also allow you to navigate to other pages of the site',
        },
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/8M9ta1Tv3V8V.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Action Bar. Open the Action Bar tutorial to explore its functions.',
        },
        {
          title: 'Transaction Summary Section',
          image: 'https://r2.fivemanage.com/image/bHIeyA1m3aKl.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This shows a summary of the transaction type(s) selected on the Action Bar. View Action Bar tutorial for details.',
        },
        {
          title: 'Transaction Records Table',
          image: 'https://r2.fivemanage.com/image/saBxBU3tU6sm.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The table shows the transactions of the shop. The column headers can be clicked/tapped to sort the table using that column.',
        },
        {
          title: 'Transaction Details',
          image: 'https://r2.fivemanage.com/image/ygULHYnVuzUv.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'Clicking on a transaction in the table opens this popup. This popup shows the specfic details of the selected transaction.',
        },
      ],
    },
    {
      id: 'transactionsActionBar',
      title: 'Action Bar',
      description: 'Explore the Action Bar',
      requiredPermissions: ['page.transactions.view'],
      screenshots: [
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/8M9ta1Tv3V8V.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the Action Bar',
        },
        {
          title: 'Transaction Type Selection',
          image: 'https://r2.fivemanage.com/image/eSYy3PDsll3O.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'Using these buttons, you can choose which type(s) of transactions are shown and which transaction type summary is shown',
        },
        {
          title: 'Export to CSV',
          image: 'https://r2.fivemanage.com/image/yRLpUOOyKBCR.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The export button allows you to export the currently shown transactions to be exported to a CSV file.',
        },
        {
          title: 'Select Mode',
          image: 'https://r2.fivemanage.com/image/yRLpUOOyKBCR.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Select mode allows you to select multiple transactions in the table for an action. Open the Select Mode tutorial to explore its functions.',
        },
        {
          title: 'Filters and Clear Filters',
          image: 'https://r2.fivemanage.com/image/WgArfxwrNEt2.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters button opens the Filters section which filters the shown transactions. The Clear Filters button clears all the manually set filters.',
        },
        {
          title: 'Filters Section',
          image: 'https://r2.fivemanage.com/image/6YrOfVEPjxmd.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters section contains all the filters that can be used to control which transactions are shown on the table.',
        },
      ],
    },
  ],
  '/sales': [
    {
      id: 'salesOverview',
      title: 'Sales Records',
      description: 'Learn to view and manage sales records',
      requiredPermissions: ['page.sales.view'],
      screenshots: [
        {
          title: 'Sales Dashboard',
          image: 'https://i.imgur.com/sales-dashboard.jpg',
          mobileImage: 'https://i.imgur.com/sales-dashboard-mobile.jpg',
          description: 'View sales summary cards showing total sales, items sold, and revenue. Use filters to analyze sales by timeframe, customer, or item.',
        },
        {
          title: 'Sales Records Table',
          image: 'https://i.imgur.com/sales-table.jpg',
          mobileImage: 'https://i.imgur.com/sales-table-mobile.jpg',
          description: 'Browse detailed sales records with transaction codes, customer information, and item details. Export data for external analysis.',
        },
      ],
    },
  ],
  '/services': [
    {
      id: 'servicesOverview',
      title: 'Services Management',
      description: 'Learn to manage service offerings',
      requiredPermissions: ['page.services.view'],
      screenshots: [
        {
          title: 'Services List',
          image: 'https://r2.fivemanage.com/image/yCTGEgwy5wyz.jpg',
          mobileImage: 'https://i.imgur.com/services-list-mobile.jpg',
          description: 'View all offered services with pricing and descriptions. Add new services or edit existing ones to keep your service catalog updated.',
        },
        {
          title: 'Service Management',
          image: 'https://i.imgur.com/services-actions.jpg',
          mobileImage: 'https://i.imgur.com/services-actions-mobile.jpg',
          description: 'Add new services with pricing, edit service details, or remove services that are no longer offered.',
        },
      ],
    },
  ],
  '/customers': [
    {
      id: 'customersOverview',
      title: 'Customers Page Overview',
      description: 'Learn the customer management interface',
      requiredPermissions: ['page.customers.view'],
      screenshots: [
        {
          title: 'Customers Page Header',
          image: 'https://r2.fivemanage.com/image/WQJgSizfAyEH.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the page header',
        },
        {
          title: 'Logo, Page Title, Welcome',
          image: 'https://r2.fivemanage.com/image/5q5R3ZwrhjGC.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'You can click/tap the logo to return to the home page.',
        },
        {
          title: 'Search Bar, Logout button, and Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/toryFK6XV0Et.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'For mobile, click the dropdown menu button to view the Search and Logout functions. You can use the search bar to search for customers, and the Logout button to logout of the site.',
        },
        {
          title: 'Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/KgVH1JZsHfM7.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The dropdown menu shows the current page, and also allow you to navigate to other pages of the site',
        },
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/toAzHbtrLUtK.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Action Bar. Open the Action Bar tutorial to explore its functions.',
        },
        {
          title: 'Available Customers Section',
          image: 'https://r2.fivemanage.com/image/iVWD1kxGl3EX.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Available Customers section where you can view the list of stored customer information.',
        },
        {
          title: 'Customer Details Section',
          image: 'https://r2.fivemanage.com/image/BhMvLM3lamFt.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: "Clicking on a row in the Available Customers table shows the selected customer's details here.",
        },
      ],
    },
    {
      id: 'customersActionBar',
      title: 'Action Bar',
      description: 'Explore the Action Bar',
      requiredPermissions: ['page.customers.view'],
      screenshots: [
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/mEoIUtuBWKH8.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the Action Bar',
        },
        {
          title: 'Export to CSV',
          image: 'https://r2.fivemanage.com/image/a8nRP0GnSLZw.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The export button allows you to export the currently shown customers to be exported to a CSV file.',
        },
        {
          title: 'Select Mode',
          image: 'https://r2.fivemanage.com/image/ytw6XGvQcnmD.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Select mode allows you to select multiple customers in the table for an action. Open the Select Mode tutorial to explore its functions.',
        },
        {
          title: 'Filters and Clear Filters',
          image: 'https://r2.fivemanage.com/image/HzqheQuRNF4E.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters button opens the Filters section which filters the shown customers. The Clear Filters button clears all the manually set filters.',
        },
        {
          title: 'Filters Section',
          image: 'https://r2.fivemanage.com/image/hw7gGqdeRQcw.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters section contains all the filters that can be used to control which customers are shown on the table.',
        },
      ],
    },
  ],
  '/returns': [
    {
      id: 'returnsOverview',
      title: 'Returns Management',
      description: 'Learn to process and manage returns',
      requiredPermissions: ['page.returns.view'],
      screenshots: [
        {
          title: 'Returns Dashboard',
          image: 'https://i.imgur.com/returns-dashboard.jpg',
          mobileImage: 'https://i.imgur.com/returns-dashboard-mobile.jpg',
          description: 'View all return requests with status tracking. Process returns, issue refunds, and manage return inventory.',
        },
        {
          title: 'Return Processing',
          image: 'https://i.imgur.com/returns-process.jpg',
          mobileImage: 'https://i.imgur.com/returns-process-mobile.jpg',
          description: 'Select items from original transactions, specify return quantities, and process refunds or exchanges.',
        },
      ],
    },
  ],
  '/users': [
    {
      id: 'usersOverview',
      title: 'Users Page Overview',
      description: 'Learn the user management interface',
      requiredPermissions: ['page.users.view'],
      screenshots: [
        {
          title: 'Users Page Header',
          image: 'https://r2.fivemanage.com/image/acmMx8BxKzeQ.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the page header',
        },
        {
          title: 'Logo, Page Title, Welcome',
          image: 'https://r2.fivemanage.com/image/bUXYt64hPh6w.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'You can click/tap the logo to return to the home page.',
        },
        {
          title: 'Search Bar, Logout button, and Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/xqkq5VXS4gfA.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'For mobile, click the dropdown menu button to view the Search and Logout functions. You can use the search bar to search users using either Name or Username, and the Logout button to logout of the site.',
        },
        {
          title: 'Dropdown Menu',
          image: 'https://r2.fivemanage.com/image/mUc3InHGxZMr.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The dropdown menu shows the current page, and also allow you to navigate to other pages of the site',
        },
        {
          title: 'User Details Section',
          image: 'https://r2.fivemanage.com/image/EJtzB0EuhxN1.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Item Details section where you can view the details of an item.',
        },
        {
          title: 'User Details Section: Expanded',
          image: 'https://r2.fivemanage.com/image/k6br1FYVZyIB.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: "Clicking on a row in the System Users table shows the selected user's details here.",
        },
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/pMnSllyoTZgR.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'This is the Action Bar. Open the Action Bar tutorial to explore its functions.',
        },
        {
          title: 'System Users Table',
          image: 'https://r2.fivemanage.com/image/N3ykFW00jn8B.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: "This table shows the system users.",
        },
      ],
    },
    {
      id: 'usersActionBar',
      title: 'Action Bar',
      description: 'Explore the Action Bar',
      requiredPermissions: ['page.users.view'],
      screenshots: [
        {
          title: 'Action Bar',
          image: 'https://r2.fivemanage.com/image/0kDNdTQIPDGy.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'This is the Action Bar',
        },
        {
          title: 'Export to CSV',
          image: 'https://r2.fivemanage.com/image/9sYolcHX8Y7C.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The export button allows you to export the currently shown users to be exported to a CSV file.',
        },
        {
          title: 'Select Mode',
          image: 'https://r2.fivemanage.com/image/qDtlyz5wV1dh.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Select mode allows you to select multiple users in the table for an action. Open the Select Mode tutorial to explore its functions.',
        },
        {
          title: 'Filters and Clear Filters',
          image: 'https://r2.fivemanage.com/image/FC19iLv3OvhN.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters button opens the Filters section which filters the shown users. The Clear Filters button clears all the manually set filters.',
        },
        {
          title: 'Filters Section',
          image: 'https://r2.fivemanage.com/image/VgIPGONehbXM.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'The Filters section contains all the filters that can be used to control which users are shown on the table.',
        },
      ],
    },
  ],
  '/settings': [
    {
      id: 'settingsOverview',
      title: 'System Settings',
      description: 'Learn to configure system settings',
      requiredPermissions: ['page.settings.view'],
      screenshots: [
        {
          title: 'Settings Dashboard',
          image: 'https://i.imgur.com/settings-main.jpg',
          mobileImage: 'https://i.imgur.com/settings-main-mobile.jpg',
          description: 'Access system configuration options including roles, permissions, and general settings.',
        },
        {
          title: 'Role and Permission Management',
          image: 'https://i.imgur.com/settings-roles.jpg',
          mobileImage: 'https://i.imgur.com/settings-roles-mobile.jpg',
          description: 'Create and manage user roles with specific permissions. Control access to different system features.',
        },
      ],
    },
  ],
};
