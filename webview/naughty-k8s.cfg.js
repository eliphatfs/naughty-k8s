(function() {

    let vscode = acquireVsCodeApi();

    let name_filter = document.createElement("vscode-text-field");
    name_filter.setAttribute("placeholder", "Filter by name...");
    name_filter.classList.add("nk8s-line");
    name_filter.onkeyup = (ev) => {
        if (ev.key == "Enter") updateNameFilter();
    }
    name_filter.onblur = updateNameFilter;

    function updateNameFilter() {
        vscode.postMessage({
            command: 'filter-name',
            args: [name_filter.value]
        });
    }

    window.addEventListener('message', (ev) => {
        let msg = ev.data;
        if (msg.command == 'init') {
            name_filter.value = msg.nameFilterValue;
        }
    });

    document.getElementById("main").appendChild(name_filter);
    vscode.postMessage({ command: 'ready' });

})()
