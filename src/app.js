"use strict";

//JS
import { d2Get, d2PostPlain, d2Delete } from "./js/d2api.js";
import Choices from "choices.js";
import M from "materialize-css";
import pLimit from "p-limit";

//CSS
import "./css/style.css";
import "materialize-css/dist/css/materialize.min.css";
import "choices.js/public/assets/styles/choices.min.css";
import { loadLegacyHeaderBarIfNeeded } from "./js/check-header-bar.js";


let unusedVariablesFilter;

document.addEventListener("DOMContentLoaded", async function () {
    loadLegacyHeaderBarIfNeeded();
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
    unusedVariablesFilter.passedElement.element.addEventListener("change", filterUnusedVariablesTable);
});


function stripStringLiterals(expression) {
    return expression.replace(/(["'])(?:\\.|[^\\])*?\1/g, '');
}

function extractPRVsFromD2HasValue(expression) {
    const matches = [];
    const regex = /d2:hasValue\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;
    while ((match = regex.exec(expression)) !== null) {
        matches.push(match[1]);
    }
    return matches;
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
        const programMap = new Map(programs.programs.map(program => [program.id, program.name]));

        const unusedVariablesTable = document.getElementById("unusedVariablesTable").querySelector("tbody");
        const invalidActionExpressionsTable = document.getElementById("invalidActionExpressionsTable").querySelector("tbody");
        const invalidConditionExpressionsTable = document.getElementById("invalidConditionExpressionsTable").querySelector("tbody");

        unusedVariablesTable.innerHTML = "";
        invalidActionExpressionsTable.innerHTML = "";
        invalidConditionExpressionsTable.innerHTML = "";

        const progressCombinedBar = document.getElementById("progressCombinedBar");

        let selectedPrograms = programs.programs;
        if (programIds) {
            selectedPrograms = selectedPrograms.filter(program => programIds.includes(program.id));
        }

        unusedVariablesFilter.clearStore();

        selectedPrograms.forEach(program => {
            unusedVariablesFilter.setChoices([{ value: program.id, label: program.name }], "value", "label", false);
        });

        const limit = pLimit(10);

        for (const [programIndex, program] of selectedPrograms.entries()) {
            const programId = program.id;
            const programRules = await d2Get(`api/programRules.json?fields=name,id,condition,programRuleActions[data,content,description]&paging=false&filter=program.id:eq:${programId}`);
            const programRuleVariables = await d2Get(`api/programRuleVariables.json?fields=name,id,program[id]&paging=false&filter=program.id:eq:${programId}`);

            const usedVariables = new Set();


            const programStartProgress = (programIndex / selectedPrograms.length) * 100;
            const programEndProgress = ((programIndex + 1) / selectedPrograms.length) * 100;
            const programProgressInterval = programEndProgress - programStartProgress;


            const tasks = programRules.programRules.map((rule, ruleIndex) => limit(async () => {
                const ruleProgress = ((ruleIndex + 1) / programRules.programRules.length) * programProgressInterval;
                progressCombinedBar.style.width = `${programStartProgress + ruleProgress}%`;

                let invalidActionExpressions = [];
                let invalidConditionExpressions = [];

                if (rule.condition) {
                    const cleanCondition = stripStringLiterals(rule.condition || "");

                    // PRVs found in d2:hasValue('...')
                    const hasValuePRVs = new Set(extractPRVsFromD2HasValue(rule.condition));

                    for (const prv of programRuleVariables.programRuleVariables) {
                        const ref1 = `#{${prv.name}}`;
                        const ref2 = `A{${prv.name}}`;

                        const usedInCurly = cleanCondition.includes(ref1) || cleanCondition.includes(ref2);
                        const usedInHasValue = hasValuePRVs.has(prv.name);

                        if (usedInCurly || usedInHasValue) {
                            usedVariables.add(prv.name);
                        }
                    }

                    // Still validate the condition with the backend
                    try {
                        const res = await d2PostPlain(
                            `api/programRules/condition/description?programId=${programId}`,
                            rule.condition
                        );
                        if (!res.ok || res.status === "ERROR") {
                            invalidConditionExpressions.push(res.description || res.message || "Condition validation failed");
                        }
                    } catch {
                        invalidConditionExpressions.push("Condition validation error");
                    }
                }

                for (const action of rule.programRuleActions) {
                    const cleanContent = stripStringLiterals(action.content || "");
                    const cleanData = stripStringLiterals(action.data || "");

                    const hasValuePRVs = new Set([
                        ...extractPRVsFromD2HasValue(action.content || ""),
                        ...extractPRVsFromD2HasValue(action.data || "")
                    ]);

                    for (const prv of programRuleVariables.programRuleVariables) {
                        const ref1 = `#{${prv.name}}`;
                        const ref2 = `A{${prv.name}}`;

                        const usedInCurly = cleanContent.includes(ref1) || cleanContent.includes(ref2) ||
                            cleanData.includes(ref1) || cleanData.includes(ref2);

                        const usedInHasValue = hasValuePRVs.has(prv.name);

                        if (usedInCurly || usedInHasValue) {
                            usedVariables.add(prv.name);
                        }
                    }

                    if (action.data) {
                        try {
                            const res = await d2PostPlain(
                                `api/programRuleActions/data/expression/description?programId=${programId}`,
                                action.data
                            );
                            if (!res.ok || res.status === "ERROR") {
                                invalidActionExpressions.push(res.description || res.message || "Invalid action expression");
                            }
                        } catch {
                            invalidActionExpressions.push("Action expression validation error");
                        }
                    }
                }

                return { rule, invalidActionExpressions, invalidConditionExpressions };
            }));

            const results = await Promise.all(tasks);

            results.forEach(({ rule, invalidActionExpressions, invalidConditionExpressions }) => {
                const ruleLink = `../../../dhis-web-maintenance/index.html#/edit/programSection/programRule/${rule.id}`;

                invalidConditionExpressions.forEach(msg => {
                    const row = invalidConditionExpressionsTable.insertRow();
                    row.insertCell(0).innerText = program.name;
                    row.insertCell(1).innerText = rule.name;
                    row.insertCell(2).innerText = rule.id;
                    row.insertCell(3).innerText = msg;
                    const cell = row.insertCell(4);
                    const btn = document.createElement("button");
                    btn.innerText = "Maintenance";
                    btn.onclick = () => window.open(ruleLink, "_blank");
                    cell.appendChild(btn);
                });

                invalidActionExpressions.forEach(msg => {
                    const row = invalidActionExpressionsTable.insertRow();
                    row.insertCell(0).innerText = program.name;
                    row.insertCell(1).innerText = rule.name;
                    row.insertCell(2).innerText = rule.id;
                    row.insertCell(3).innerText = msg;
                    const cell = row.insertCell(4);
                    const btn = document.createElement("button");
                    btn.innerText = "Maintenance";
                    btn.onclick = () => window.open(ruleLink, "_blank");
                    cell.appendChild(btn);
                });
            });

            const unusedVariables = programRuleVariables.programRuleVariables.filter(prv => !usedVariables.has(prv.name));

            unusedVariables.forEach(variable => {
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
                row.insertCell(1).innerText = programMap.get(variable.program.id);
                row.cells[1].dataset.programId = variable.program.id;
                row.insertCell(2).innerText = variable.name;
                row.insertCell(3).innerText = variable.id;
            });
        }

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


