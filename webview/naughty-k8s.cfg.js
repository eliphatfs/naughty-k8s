(function() {

let vscode = acquireVsCodeApi();

let name_filter = document.createElement("vscode-text-field");
name_filter.setAttribute("placeholder", "Filter by name...");
name_filter.classList.add("nk8s-line");
name_filter.onblur = () => {
    vscode.postMessage({
        command: 'filter-name',
        args: [name_filter.value]
    })
};

document.getElementById("main").appendChild(name_filter);

})()
