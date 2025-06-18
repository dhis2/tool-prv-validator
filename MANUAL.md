# User Manual for DHIS2 Program Rules and Variables Validator Web App

## Overview

This tool validates program rules and program rule variables in DHIS2, identifying invalid program rules and unused variables. It allows you to bulk delete unused program rule variables. It is intended to be used with care in a development or test environment by a system administrator.

## Prerequisites

- Ensure you have administrative access to your DHIS2 instance.
- Recommended to use in a development or test environment before moving to production.

## Installation Guide

### Step 1: Download the Web App

1. Go to the GitHub repository for the DHIS2 Program Rules and Variables Validator.
2. Navigate to the [Releases](https://github.com/dhis2/tool-prv-validator/releases) section.
3. Download the latest version of the `.zip` file from the releases.

### Step 2: Install the Web App in DHIS2

1. Log into your DHIS2 instance with your administrator account.
2. Navigate to the **Apps** section.
3. Click on **App Management**.
4. Click on the **Install new app** button.
5. Upload the `.zip` file that you downloaded from GitHub.
6. Deploy the app by following the on-screen instructions.

## User Guide

### Initial Setup

1. Access the app from your DHIS2 app menu.
2. The main interface will load, displaying options for program validation.

### Using the App

#### Selecting Programs

1. Use the dropdown menu under "Programme(s) to validate" to select multiple programs to validate.
2. To search for a program, type the program name in the search box.

#### Validating Programs

1. **Validate Selected:**
   - Enable by selecting at least one program from the dropdown.
   - Click the "Validate Selected" button to validate the selected programs.
   
2. **Validate All:**
   - Click the "Validate All" button to validate all programs available in the DHIS2 instance.

3. **Progress:**
   - A progress bar will appear indicating the validation progress. Not that validating programmes can take sevral minutes.

#### Viewing Results

1. **Invalid Conditions:**
   - The "Invalid Conditions" tab lists program rules with invalid condition expressions.

2. **Invalid Actions:**
   - The "Invalid Actions" tab lists program rule actions with invalid expressions.

3. **Unused Variables:**
   - The "Unused Variables" tab displays a table of program rule variables not used in any program rules.
   - Use the "Filter by Programme" dropdown to filter variables by selected programs.

#### Deleting Unused Variables

1. **Select Variables to Delete:**
   - Use checkboxes in the "Unused Variables" table to select variables for deletion.
   - The "Delete selected" button will enable when at least one variable is checked.

2. **Delete Selected Variables:**
   - Click "Delete selected" to remove the selected program rule variables from the DHIS2 instance.
   - A confirmation prompt will appear to confirm deletion.

3. **Feedback:**
   - A success message will display if variables are deleted successfully.
   - A failure message will display if there were any issues during deletion.

## Best Practices

- Regularly back up your DHIS2 instance before making bulk changes.
- Test the app's functionality in a development or test environment to prevent disruptions in your production environment.
- Carefully review the validation and deletion results to ensure data integrity.

## Troubleshooting

- Ensure you have the necessary administrative privileges to perform actions within the app.
- If validation or deletion operations fail, check the console logs for error messages.
