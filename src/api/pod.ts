import * as vscode from 'vscode';
import * as api from '.';
import * as k8s from '@kubernetes/client-node';


export async function listPods(): Promise<k8s.V1Pod[]> {
    const k8sApi = api.make(k8s.CoreV1Api);
    const resp = await k8sApi.listNamespacedPod(api.ns());
    return resp.body.items;
}

class NoncePodCommandStream {
    name: string

    constructor(name: string) {
        this.name = name
    }

    close() {

    }
}
