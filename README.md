# naughty-k8s README

A Kubernetes plugin that considers latency.

## Features

1. Listing Pods. Filtering by name so you find your pods easily.
2. Mounting Pod as folder dynamically into workspace. Work on local and remote at the same time.
3. Download files from mounted pods. Set download destination by context menus or in configuration.
4. Easily viewing streamed logs and events in text editor.
5. All operations take network latency into account. For example, refreshing pods only requires one round-trip, which is much faster than `kubectl get pods` or the official plugins considering network latency.

## Experimental Features

1. Find who is using gpu in the cluster. Search for this in command palette!

## Requirements

`kubectl` and `kubectl-convert` plugin, as well as a working `kubeconfig`. The plugin will pop up a notice with instructions of installation if you have not set up them yet.

## Extension Settings

## Known Issues

1. Downloading directory from mounted pods are slower than single file due to non-optimized buffer control.
   Also, the progress does not show correctly when downloading directory.

## Release Notes

Unreleased.
