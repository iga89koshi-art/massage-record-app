function doPost(e) {
  try {
    const sheetName = "施術記録";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(["Timestamp", "Date", "Patient", "Staff", "Memo", "ID"]); // Header
    }
    
    // Parse data
    const data = JSON.parse(e.postData.contents);
    
    // Append row
    sheet.appendRow([
      new Date(),       // Timestamp (Server time)
      data.date,        // Form Date
      data.patient,     // Patient Name
      data.staff,       // Staff Name
      data.memo,        // Memo
      data.id           // Unique ID
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
   return ContentService.createTextOutput("This Web App is working. Use POST to send data.");
}
