export interface TutorialScreenshot {
  image: string;
  mobileImage?: string;
  description: string;
  title?: string;
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
        {
          title: 'Main Inventory Interface',
          image: 'https://i.imgur.com/inventory-main.jpg',
          mobileImage: 'https://i.imgur.com/inventory-main-mobile.jpg',
          description: 'This is the main inventory interface where you can view all items, search, and perform actions like adding, editing, or archiving items.',
        },
        {
          title: 'Adding and Managing Items',
          image: 'https://i.imgur.com/inventory-actions.jpg',
          mobileImage: 'https://i.imgur.com/inventory-actions-mobile.jpg',
          description: 'Click Add Item to create new inventory. Use Edit to modify details, Archive to hide items, or Delete to permanently remove archived items.',
        },
      ],
    },
  ],
  '/transactions/new': [
    {
      id: 'transactionOverview',
      title: 'Transaction Process',
      description: 'Learn the complete transaction workflow',
      requiredPermissions: ['page.newtransaction.view', 'transactions.create'],
      screenshots: [
        {
          title: 'Customer Information',
          image: 'https://i.imgur.com/tx-customer.jpg',
          mobileImage: 'https://i.imgur.com/tx-customer-mobile.jpg',
          description: 'Enter customer details including name, contact information, and address. This information will be saved for future transactions.',
        },
        {
          title: 'Item Selection and Cart',
          image: 'https://i.imgur.com/tx-items.jpg',
          mobileImage: 'https://i.imgur.com/tx-items-mobile.jpg',
          description: 'Select products from inventory and services. Use the cart button to view selected items, adjust quantities, and apply discounts or markups.',
        },
        {
          title: 'Payment and Completion',
          image: 'https://i.imgur.com/tx-payment.jpg',
          mobileImage: 'https://i.imgur.com/tx-payment-mobile.jpg',
          description: 'Choose payment method (Cash/GCash), enter payment amounts, and complete the transaction. The system will update inventory levels automatically.',
        },
      ],
    },
  ],
  '/transactions': [
    {
      id: 'transactionsOverview',
      title: 'Transactions',
      description: 'Learn to manage and view transaction records',
      requiredPermissions: ['page.transactions.view'],
      screenshots: [
        {
          title: 'Transaction Records',
          image: 'https://r2.fivemanage.com/image/JZpA6BqFpY5a.jpg',
          mobileImage: 'https://i.imgur.com/transactions-list-mobile.jpg',
          description: 'View all transaction records with search and filtering options. Click on any transaction to view detailed information and items.',
        },
        {
          title: 'Transaction Actions',
          image: 'https://r2.fivemanage.com/image/VV2KWLTiQ7dW.jpg',
          mobileImage: 'https://i.imgur.com/transactions-actions-mobile.jpg',
          description: 'Use filters to find specific transactions, export records for reporting, or archive/delete old transactions as needed.',
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
  '/servicesoffered': [
    {
      id: 'servicesOverview',
      title: 'Services Management',
      description: 'Learn to manage service offerings',
      requiredPermissions: ['page.services.view'],
      screenshots: [
        {
          title: 'Services List',
          image: 'https://i.imgur.com/services-list.jpg',
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
      title: 'Customer Management',
      description: 'Learn to manage customer information',
      requiredPermissions: ['page.customers.view'],
      screenshots: [
        {
          title: 'Customer Directory',
          image: 'https://i.imgur.com/customers-list.jpg',
          mobileImage: 'https://i.imgur.com/customers-list-mobile.jpg',
          description: 'View all customers with contact information and transaction history. Search for specific customers quickly.',
        },
        {
          title: 'Customer Actions',
          image: 'https://i.imgur.com/customers-actions.jpg',
          mobileImage: 'https://i.imgur.com/customers-actions-mobile.jpg',
          description: 'Add new customers, edit existing information, or view customer transaction history and details.',
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
      title: 'User Management',
      description: 'Learn to manage user accounts and permissions',
      requiredPermissions: ['page.users.view'],
      screenshots: [
        {
          title: 'User Directory',
          image: 'https://i.imgur.com/users-list.jpg',
          mobileImage: 'https://i.imgur.com/users-list-mobile.jpg',
          description: 'View all user accounts with roles and permissions. Add new users or manage existing accounts.',
        },
        {
          title: 'User Roles and Permissions',
          image: 'https://i.imgur.com/users-roles.jpg',
          mobileImage: 'https://i.imgur.com/users-roles-mobile.jpg',
          description: 'Assign roles to users and manage permission levels. Control access to different features based on user roles.',
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
