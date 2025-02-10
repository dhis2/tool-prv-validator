"use strict";

//JS
import { d2Get, d2PostPlain, d2Delete } from "./js/d2api.js";
import Choices from "choices.js";
import M from "materialize-css";

//CSS
import "./css/style.css";
import "materialize-css/dist/css/materialize.min.css";
import "choices.js/public/assets/styles/choices.min.css";

let validationResultsFilter, unusedVariablesFilter;

function extractVariables(str) {
    const regex = /#{(\w+)}/g;
    const variables = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        variables.push(match[0]);
    }
    return variables;
}

document.addEventListener("DOMContentLoaded", async function () {
    const programs = await d2Get("api/programs.json?fields=name,id&paging=false");
    const programChoices = new Choices("#programDropdown", {
        choices: programs.programs.map(program => ({ value: program.id, label: program.name })),
        searchEnabled: true,
        placeholder: true,
        placeholderValue: "Programme(s) to validate",
        searchPlaceholderValue: "Search programmes",
        removeItemButton: true
    });

    const tabs = document.querySelectorAll(".tabs");
    M.Tabs.init(tabs);

    const validateSelectedButton = document.getElementById("validateSelectedButton");
    const validateAllButton = document.getElementById("validateAllButton");
    const progressContainer = document.querySelector(".progress-container");

    const deleteSelectedButton = document.querySelector("button[onclick='window.deleteSelectedVariables()']");
    deleteSelectedButton.disabled = true;

    // Enable/disable delete button based on checkbox selection
    document.getElementById("unusedVariablesTable").addEventListener("change", function () {
        const checkboxes = document.querySelectorAll("#unusedVariablesTable .variable-checkbox:checked");
        deleteSelectedButton.disabled = checkboxes.length === 0;
    });

    // Enable validate buttons based on program selection
    document.getElementById("programDropdown").addEventListener("change", function () {
        const selectedProgramIds = programChoices.getValue(true);
        validateSelectedButton.disabled = selectedProgramIds.length === 0;
    });

    validateSelectedButton.onclick = function () {
        const selectedProgramIds = programChoices.getValue(true);
        if (selectedProgramIds.length > 0) {
            validateSelectedButton.disabled = true;
            validateAllButton.disabled = true;
            deleteSelectedButton.disabled = true;
            progressContainer.style.display = "block";
            window.validateProgramRules(selectedProgramIds).finally(() => {
                validateSelectedButton.disabled = false;
                validateAllButton.disabled = false;
                progressContainer.style.display = "none";
            });
        } else {
            alert("Please select at least one program to validate.");
        }
    };

    validateAllButton.onclick = function () {
        validateSelectedButton.disabled = true;
        validateAllButton.disabled = true;
        deleteSelectedButton.disabled = true;
        progressContainer.style.display = "block";
        window.validateProgramRules().finally(() => {
            validateSelectedButton.disabled = false;
            validateAllButton.disabled = false;
            progressContainer.style.display = "none";
        });
    };

    validationResultsFilter = new Choices("#validationResultsFilter", {
        searchEnabled: true,
        placeholder: true,
        placeholderValue: "Filter by Programme",
        searchPlaceholderValue: "Search programmes",
        removeItemButton: true,
        shouldSort: false,
        duplicateItemsAllowed: false
    });

    unusedVariablesFilter = new Choices("#unusedVariablesFilter", {
        searchEnabled: true,
        placeholder: true,
        placeholderValue: "Filter by Programme",
        searchPlaceholderValue: "Search programmes",
        removeItemButton: true,
        shouldSort: false,
        duplicateItemsAllowed: false
    });

    // Event listeners to filter tables based on selected programs
    validationResultsFilter.passedElement.element.addEventListener("change", filterValidationResultsTable);
    unusedVariablesFilter.passedElement.element.addEventListener("change", filterUnusedVariablesTable);
});

function filterValidationResultsTable() {
    const selectedProgramIds = Array.from(document.getElementById("validationResultsFilter").selectedOptions).map(option => option.value);
    const rows = document.querySelectorAll("#validationResultsTable tbody tr");
    if (selectedProgramIds.length === 0) {
        rows.forEach(row => row.style.display = "");
    } else {
        rows.forEach(row => {
            const programId = row.cells[0].dataset.programId;
            row.style.display = selectedProgramIds.includes(programId) ? "" : "none";
        });
    }
}

function filterUnusedVariablesTable() {
    const selectedProgramIds = Array.from(document.getElementById("unusedVariablesFilter").selectedOptions).map(option => option.value);
    const rows = document.querySelectorAll("#unusedVariablesTable tbody tr");
    if (selectedProgramIds.length === 0) {
        rows.forEach(row => row.style.display = "");
    } else {
        rows.forEach(row => {
            const programId = row.cells[1].dataset.programId;
            row.style.display = selectedProgramIds.includes(programId) ? "" : "none";
        });
    }
}

window.validateProgramRules = async function (programIds = null) {
    // Attach event listener for "Select All" checkbox
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    selectAllCheckbox.onclick = function () {
        const rows = document.querySelectorAll("#unusedVariablesTable tbody tr");
        rows.forEach(row => {
            if (row.style.display !== "none") {
                const checkbox = row.querySelector(".variable-checkbox");
                checkbox.checked = selectAllCheckbox.checked;
            }
        });
        const deleteSelectedButton = document.querySelector("button[onclick='window.deleteSelectedVariables()']");
        deleteSelectedButton.disabled = document.querySelectorAll("#unusedVariablesTable .variable-checkbox:checked").length === 0;
    };

    try {
        const programs = await d2Get("api/programs.json?fields=name,id&paging=false");
        const programMap = new Map(programs.programs.map(program => [program.id, program.name])); // Map program IDs to names

        const validationResultsTable = document.getElementById("validationResultsTable").querySelector("tbody");
        validationResultsTable.innerHTML = "";
        const unusedVariablesTable = document.getElementById("unusedVariablesTable").querySelector("tbody");
        unusedVariablesTable.innerHTML = "";

        // Combined progress indicators
        const progressCombinedBar = document.getElementById("progressCombinedBar");

        let selectedPrograms = programs.programs;
        if (programIds) {
            selectedPrograms = programs.programs.filter(program => programIds.includes(program.id));
        }

        validationResultsFilter.clearStore();
        unusedVariablesFilter.clearStore();

        // Make all rows visible again
        document.querySelectorAll("#validationResultsTable tbody tr").forEach(row => row.style.display = "");
        document.querySelectorAll("#unusedVariablesTable tbody tr").forEach(row => row.style.display = "");

        selectedPrograms.forEach(program => {
            validationResultsFilter.setChoices([{ value: program.id, label: program.name }], "value", "label", false);
            unusedVariablesFilter.setChoices([{ value: program.id, label: program.name }], "value", "label", false);
        });

        let processedPrograms = 0;
        let processedRules = 0;

        for (const program of selectedPrograms) {
            const programId = program.id;
            processedPrograms++;

            // Fetch Program Rules & Program Rule Variables for the Program
            const programRules = await d2Get(`api/programRules.json?fields=name,id,condition,programRuleActions[data,content]&paging=false&filter=program.id:eq:${programId}`);
            const programRuleVariables = await d2Get(`api/programRuleVariables.json?fields=name,id,program[id]&paging=false&filter=program.id:eq:${programId}`);

            const variableNames = programRuleVariables.programRuleVariables.map(prv => `#{${prv.name}}`);
            const usedVariables = new Set();

            const programStartProgress = ((processedPrograms - 1) / selectedPrograms.length) * 100;
            const programEndProgress = (processedPrograms / selectedPrograms.length) * 100;
            const programProgressInterval = programEndProgress - programStartProgress;
            processedRules = 0;
            for (const rule of programRules.programRules) {
                processedRules++;
                const ruleProgress = (processedRules / programRules.programRules.length) * (programProgressInterval);
                const overallProgress = programStartProgress + ruleProgress;
                progressCombinedBar.style.width = `${overallProgress}%`;

                let invalid = false;
                let missingVariables = [];

                // Validate if all variables in condition exist
                if (rule.condition) {
                    const conditionVariables = extractVariables(rule.condition);
                    conditionVariables.forEach(varName => {
                        if (!variableNames.includes(varName)) {
                            invalid = true;
                            missingVariables.push(varName);
                        } else {
                            usedVariables.add(varName);
                        }
                    });

                    // Check validity of the condition property
                    if (!invalid) {
                        try {
                            let result = await d2PostPlain(`api/programRules/condition/description?programId=${programId}`, rule.condition);
                            if (result.status === "ERROR") {
                                invalid = true;
                                missingVariables.push(result.message);
                            }
                        } catch (error) {
                            console.log(error);
                            invalid = true;
                            missingVariables.push("Validation of condition failed.");
                        }
                    }
                }

                // Validate if all variables in program rule actions exist
                rule.programRuleActions.forEach(action => {
                    if (action.content) {
                        const contentVariables = extractVariables(action.content);
                        contentVariables.forEach(varName => {
                            if (!variableNames.includes(varName)) {
                                invalid = true;
                                missingVariables.push(varName);
                            } else {
                                usedVariables.add(varName);
                            }
                        });
                    }

                    if (action.data) {
                        const dataVariables = extractVariables(action.data);
                        dataVariables.forEach(varName => {
                            if (!variableNames.includes(varName)) {
                                invalid = true;
                                missingVariables.push(varName);
                            } else {
                                usedVariables.add(varName);
                            }
                        });
                    }
                });

                // If invalid, add to results table
                if (invalid) {
                    const row = validationResultsTable.insertRow();
                    row.insertCell(0).innerText = program.name;
                    row.cells[0].dataset.programId = program.id;
                    row.insertCell(1).innerText = rule.name;
                    row.insertCell(2).innerText = rule.id;
                    const missingVarsCell = row.insertCell(3);
                    missingVarsCell.innerText = missingVariables.join(", ");
                    const actionCell = row.insertCell(4);
                    const btn = document.createElement("button");
                    btn.innerText = "Maintenance";
                    btn.onclick = () => window.open(`../../../dhis-web-maintenance/index.html#/edit/programSection/programRule/${rule.id}`, "_blank");
                    actionCell.appendChild(btn);
                }
            }

            // Find unused variables
            const unusedVariables = programRuleVariables.programRuleVariables.filter(prv => !usedVariables.has(`#{${prv.name}}`));
            for (const variable of unusedVariables) {
                const row = unusedVariablesTable.insertRow();
                const selectCell = row.insertCell(0);
                const label = document.createElement("label");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.classList.add("variable-checkbox", "filled-in");
                checkbox.value = variable.id;
                label.appendChild(checkbox);
                label.appendChild(document.createElement("span"));
                selectCell.appendChild(label);
                row.insertCell(1).innerText = programMap.get(variable.program.id); // Add program name
                row.cells[1].dataset.programId = variable.program.id;
                row.insertCell(2).innerText = variable.name;
                row.insertCell(3).innerText = variable.id;
            }
        }
        
        // Clear progress indicators when done
        progressCombinedBar.style.width = "100%";
    } catch (error) {
        console.error("Validation failed", error);
    }
};

window.deleteSelectedVariables = async function () {
    try {
        const checkboxes = document.querySelectorAll("#unusedVariablesTable input[type='checkbox']:checked");
        const idsToDelete = Array.from(checkboxes)
            .filter(cb => cb.id !== "selectAllCheckbox")
            .map(cb => cb.value);
        console.log("Ids to delete:", idsToDelete); // Added log for ids to delete
        if (idsToDelete.length === 0) {
            M.toast({ html: "No variables selected for deletion.", classes: "red" });
            return;
        }

        if (!confirm("Are you sure you want to delete selected variables?")) return;

        let successCount = 0;
        let failureCount = 0;

        for (const id of idsToDelete) {
            try {
                await d2Delete(`api/programRuleVariables/${id}`);
                successCount++;
                // Remove the row from the table
                const row = document.querySelector(`#unusedVariablesTable input[value='${id}']`).closest("tr");
                row.remove();
            } catch (error) {
                console.error("Error deleting variable with id:", id, error); // Added specific error logs
                failureCount++;
            }
        }

        if (successCount > 0) {
            M.toast({ html: `Deleted ${successCount} variables.`, classes: "green" });
        }
        if (failureCount > 0) {
            M.toast({ html: `Failed to delete ${failureCount} variables.`, classes: "red" });
        }

        // Disable delete button if no checkboxes are selected
        const remainingCheckboxes = document.querySelectorAll("#unusedVariablesTable .variable-checkbox:checked");
        const deleteSelectedButton = document.querySelector("button[onclick='window.deleteSelectedVariables()']");
        deleteSelectedButton.disabled = remainingCheckboxes.length === 0;
    } catch (error) {
        console.error("Deletion failed", error);
        M.toast({ html: "Deletion failed.", classes: "red" });
    }
};


