# naughty-k8s README

A Kubernetes plugin that considers latency.

## Features

1. Listing Pods. Filtering by name so you find your pods easily.
2. Mounting Pod as folder dynamically into workspace. Work on local and remote at the same time.
3. Easily viewing streamed logs and events in text editor.
4. All operations take network latency into account. For example, refreshing pods only requires one round-trip, which is much faster than `kubectl get pods` or the official plugins considering network latency.

## Requirements

`kubectl` and `kubectl-convert` plugin, as well as a working `kubeconfig`. The plugin will pop up a notice with instructions of installation if you have not set up them yet.

## Extension Settings

## Known Issues

## Release Notes

Unreleased.
