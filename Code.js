const SCRIPT_VERSION = "v1.3"; // Updated version for verification

/**
 * Main entry point for API requests from the client-side application.
 * Handles different actions by routing them to specific handler functions.
 * @param {object} e - The event parameter from the HTTP POST request, containing the payload.
 * @returns {ContentService.TextOutput} - A JSON response.
 */
function doPost(e) {
  Logger.log(`API ${SCRIPT_VERSION} Running...`);
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    Logger.log(`Received action: ${action} with payload: ${JSON.stringify(payload)}`);

    switch (action) {
      case 'getClientData':
        return handleGetClientData(payload);
      case 'getAdminDashboardData':
      case 'getAllOrders':
        return handleGetAllOrders();
      case 'updateOrderStatus':
        return handleUpdateOrderStatus(payload);
      case 'sendNotificationToClient':
        return handleSendNotification(payload);
      default:
        Logger.log(`Error: Unknown action requested: ${action}`);
        return createJsonResponse({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (error) {
    Logger.log('Critical Error in doPost: ' + error.toString());
    return createJsonResponse({ status: 'error', message: 'Invalid request or server error: ' + error.toString() });
  }
}

/**
 * Handles GET requests to the script URL. Useful for verifying deployment.
 * @returns {ContentService.TextOutput} - A simple success message.
 */
function doGet() {
  return ContentService.createTextOutput(`Google Apps Script for H.Saban App is running. Version: ${SCRIPT_VERSION}`).setMimeType(ContentService.MimeType.TEXT);
}

/**
 * A testing function to verify that Script Properties are being read correctly.
 */
function testScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const appId = scriptProperties.getProperty('ONE_SIGNAL_APP_ID');
  const apiKey = scriptProperties.getProperty('ONE_SIGNAL_REST_API_KEY');

  Logger.log('--- Verifying Script Properties ---');
  if (appId) {
    Logger.log('SUCCESS: Found ONE_SIGNAL_APP_ID: ' + appId);
  } else {
    Logger.log('ERROR: ONE_SIGNAL_APP_ID is not found or is null.');
  }

  if (apiKey) {
    Logger.log('SUCCESS: Found ONE_SIGNAL_REST_API_KEY: ' + apiKey);
  } else {
    Logger.log('ERROR: ONE_SIGNAL_REST_API_KEY is not found or is null.');
  }
  Logger.log('---------------------------------');
}


// --- Data Fetching Handlers ---

function handleGetClientData(payload) {
  const SPREADSHEET_ID = '1rOjQlttUpNEb6sxAVQ9uZVXoMMTzJF0KLjiwZyUen8U';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const customerId = String(payload.customerId).trim();
  const customersSheet = ss.getSheetByName('לקוחות');
  const customersData = getSheetData(customersSheet);
  const user = customersData.find(row => String(row['מספר לקוח']).trim() === customerId || String(row['טלפון']).trim() === customerId);

  if (!user) {
    return createJsonResponse({ status: 'error', message: 'Client not found' });
  }
  const actualCustomerId = String(user['מספר לקוח']).trim();
  const containersSheet = ss.getSheetByName('שכירות מכולות');
  const containersData = getSheetData(containersSheet);
  const clientContainers = containersData.filter(row => String(row['מספר לקוח']).trim() === actualCustomerId);
  
  const materialsSheet = ss.getSheetByName('הזמנות חומרי בנין');
  const materialsData = getSheetData(materialsSheet);
  const clientMaterialOrders = materialsData.filter(row => String(row['מספר לקוח']).trim() === actualCustomerId);

  return createJsonResponse({ status: 'success', user, containers: clientContainers, materialOrders: clientMaterialOrders });
}

function handleGetAllOrders() {
    const SPREADSHEET_ID = '1rOjQlttUpNEb6sxAVQ9uZVXoMMTzJF0KLjiwZyUen8U';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const materialsSheet = ss.getSheetByName('הזמנות חומרי בנין');
    const containersSheet = ss.getSheetByName('הזמנות מכולות');
    const materialsOrders = getSheetData(materialsSheet).map(order => ({ ...order, orderType: 'materials' }));
    const containerOrders = getSheetData(containersSheet).map(order => ({ ...order, orderType: 'container' }));
    const allOrders = [...materialsOrders, ...containerOrders].sort((a, b) => new Date(b['תאריך קליטה'] || b['תאריך הזמנה']) - new Date(a['תאריך קליטה'] || a['תאריך הזמנה']));
    return createJsonResponse({ status: 'success', orders: allOrders });
}

// --- Data Mutation Handlers ---

function handleUpdateOrderStatus(payload) {
    // This is a placeholder. In a real application, you would find the order and update its status in the sheet.
    return createJsonResponse({ status: 'success', message: 'Status updated successfully (simulation).' });
}

// --- Notification Handler ---

function handleSendNotification(payload) {
  Logger.log('Attempting to send notification. Received payload: ' + JSON.stringify(payload));
  
  const scriptProperties = PropertiesService.getScriptProperties();
  const ONE_SIGNAL_APP_ID = scriptProperties.getProperty('ONE_SIGNAL_APP_ID');
  const REST_API_KEY = scriptProperties.getProperty('ONE_SIGNAL_REST_API_KEY');

  if (!ONE_SIGNAL_APP_ID || !REST_API_KEY) {
    const errorMsg = 'OneSignal App ID or API Key not set in Script Properties.';
    Logger.log('ERROR in handleSendNotification: ' + errorMsg);
    return createJsonResponse({ status: 'error', message: errorMsg });
  }
  
  const { clientId, title, message } = payload;
  const notification = {
    app_id: ONE_SIGNAL_APP_ID,
    contents: { "en": message, "he": message },
    headings: { "en": title, "he": title },
    include_external_user_ids: [String(clientId)]
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Basic ' + REST_API_KEY },
    payload: JSON.stringify(notification),
    muteHttpExceptions: true // Get the full error response
  };

  try {
    Logger.log('Sending to OneSignal API. Payload: ' + JSON.stringify(notification));
    const response = UrlFetchApp.fetch('https://onesignal.com/api/v1/notifications', options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    Logger.log('OneSignal API Response Code: ' + responseCode);
    Logger.log('OneSignal API Response Body: ' + responseBody);

    if (responseCode === 200) {
        const parsedBody = JSON.parse(responseBody);
        if (parsedBody.recipients > 0) {
            return createJsonResponse({ status: 'success', message: `Notification sent successfully to ${parsedBody.recipients} recipient(s).` });
        } else {
            const warningMsg = `Notification sent, but no recipients found for Client ID: ${clientId}. Please verify the client has enabled notifications and is correctly identified in OneSignal.`;
            Logger.log('Warning: ' + warningMsg);
            return createJsonResponse({ status: 'warning', message: warningMsg });
        }
    } else {
        const errorMsg = `Failed to send notification. OneSignal returned status ${responseCode}. Details: ${responseBody}`;
        Logger.log('Error: ' + errorMsg);
        return createJsonResponse({ status: 'error', message: errorMsg });
    }
  } catch (error) {
    const errorMsg = 'Failed to send notification due to a script error: ' + error.toString();
    Logger.log('Fatal Error: ' + errorMsg);
    return createJsonResponse({ status: 'error', message: errorMsg });
  }
}

// --- Utility Functions ---

function getSheetData(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return data.map(row => {
    const rowObject = {};
    headers.forEach((header, index) => {
      rowObject[header] = row[index] instanceof Date ? row[index].toISOString() : row[index];
    });
    return rowObject;
  });
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

