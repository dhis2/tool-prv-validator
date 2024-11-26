"use strict";

//JS
import { d2Get, d2PostPlain, d2Delete } from "./js/d2api.js";

//CSS
import "./css/header.css";
import "./css/style.css";

function extractVariables(str) {
    const regex = /#{(\w+)}/g;
    const variables = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
        variables.push(match[0]);
    }
    return variables;
}


window.validateProgramRules = async function () {
    try {
        const programs = await d2Get("api/programs.json?fields=name,id&paging=false");
        const programMap = new Map(programs.programs.map(program => [program.id, program.name])); // Map program IDs to names

        const validationResultsTable = document.getElementById("validationResultsTable").querySelector("tbody");
        validationResultsTable.innerHTML = "";
        const unusedVariablesTable = document.getElementById("unusedVariablesTable").querySelector("tbody");
        unusedVariablesTable.innerHTML = "";

        for (const program of programs.programs) {
            const programId = program.id;

            // Fetch Program Rules & Program Rule Variables for the Program
            const programRules = await d2Get(`api/programRules.json?fields=name,id,condition,programRuleActions[data,content]&paging=false&filter=program.id:eq:${programId}`);
            const programRuleVariables = await d2Get(`api/programRuleVariables.json?fields=name,id,program[id]&paging=false&filter=program.id:eq:${programId}`);

            const variableNames = programRuleVariables.programRuleVariables.map(prv => `#{${prv.name}}`);
            const usedVariables = new Set();

            // Validate each rule
            for (const rule of programRules.programRules) {
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
                            await d2PostPlain(`api/programRules/condition/description?programId=${programId}`, rule.condition);
                        } catch (error) {
                            console.log(error);
                            invalid = true;
                            missingVariables.push("Invalid condition");
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
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = variable.id;
                selectCell.appendChild(checkbox);
                row.insertCell(1).innerText = programMap.get(variable.program.id); // Add program name
                row.insertCell(2).innerText = variable.name;
                row.insertCell(3).innerText = variable.id;
            }
        }
    } catch (error) {
        console.error("Validation failed", error);
    }
};

window.deleteSelectedVariables = async function () {
    try {
        const checkboxes = document.querySelectorAll("#unusedVariablesTable input[type='checkbox']:checked");
        const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
        console.log("Ids to delete:", idsToDelete); // Added log for ids to delete
        if (idsToDelete.length === 0) {
            console.warn("No variables selected for deletion.");
            return;
        }

        if (!confirm("Are you sure you want to delete selected variables?")) return;

        let successCount = 0;
        let failureCount = 0;

        for (const id of idsToDelete) {
            try {
                await d2Delete(`api/programRuleVariables/${id}`);
                successCount++;
            } catch (error) {
                console.error("Error deleting variable with id:", id, error); // Added specific error logs
                failureCount++;
            }
        }

        alert(`Deleted ${successCount} variables. Failed to delete ${failureCount} variables.`);
        window.validateProgramRules();
    } catch (error) {
        console.error("Deletion failed", error);
    }
};


document.addEventListener("DOMContentLoaded", window.validateProgramRules);
