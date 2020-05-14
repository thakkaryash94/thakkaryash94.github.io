---
title: Kubernetes auto-deployment using Okteto, Skaffold & GitLab CI/CD
published: true
description: Post about how to auto-deploy applications on kubernetes using GitLab-CI and Skaffold
tags: kubernetes, skaffold, okteto, gitlab
---

### Overview
CI/CD is the process that never ends. Previously, we used to auto-deploy our applications in VMs by writing scripts that ssh into the remote server and deploy it. Then containers arrived, we wrapped our code in containers and writing scripts that build docker container and deploy on servers by stopping existing services and starting up new images for the services. For K8s, things are a little different.

> kubectl is the new ssh.

[https://twitter.com/kelseyhightower/status/1070413458045202433](https://twitter.com/kelseyhightower/status/1070413458045202433)

[@kelseyhightower](https://twitter.com/kelseyhightower) said this. In k8s, we don't care about our instances or infrastructure. We perform all the operations using kubectl, like deploying, upgrading, accessing the application. So to auto-deploy our application from CI/CD, we need K8s cluster, so let's set it up first. For the demo, we will be using [Okteto Cloud](https://cloud.okteto.com).

### Okteto
Okteto provides a free K8s cluster. There are two ways to set up our k8s cluster. CLI and GUI.

#### CLI
Go to [Okteto CLI](https://okteto.com/docs/getting-started/#Step-1-Install-the-Okteto-CLI) page and follow the instructions to setup k8s cluster using CLI.

#### GUI
Go to [Okteto Cloud](https://cloud.okteto.com), log in using your GitHub account and create namespace accordingly. In my case, my Okteto namespace will be `thakkaryash94`. That's it. Now, we have a K8s cluster with our namespace. Now click on `Credentials` from the left sidebar. This will download `okteto-kube.config` file. This is actually our kube-config file, we can access our namespace by using this config file. Now, we need to set up our application, so that we can deploy it on Okteto cloud.

### Skaffold
Skaffold handles the workflow for building, pushing and deploying your application, allowing you to focus on what matters most: writing code. - This statement is directly from the website.

- Lightweight: client-side only, no on-cluster component
- Works Everywhere: you can use profiles, local user config, environment variables
- Feature Rich: Kubernetes-native development, including policy-based image tagging, resource port-forwarding and logging, file syncing, and much more
- Optimized Development: instant feedback while developing

We have finalized the tools that we need in our CI/CD pipeline. We need kubectl and Skaffold. Our k8s cluster is also ready to access the deployments. Now, we need to set up our CI/CD pipeline. We will be using GitLab CI/CD pipeline because I find it very easy and convenient to setup.

#### Setup:
We need to download skaffold on our local machine. Follow this [link](https://skaffold.dev/docs/install/) and setup as per your OS. Skaffold provides 5 Pipeline Stages.

Build, Test, Tag, Render, Deploy. We can use Skaffold for local development as well with minikube.

![Skaffold Workflow](https://skaffold.dev/images/workflow.png)

Project folder structure:
- skaffold-example
	- backend (actual application)
	- k8s
		- deployment.yaml
	- .gitlab-ci.yml
	- skaffold.yaml

You can use any existing docker project for this. Yes, it definetly requires `Dockerfile` or you can use any of the [example projects](https://github.com/GoogleContainerTools/skaffold/tree/master/examples). We will be deploying nodejs example for the demo.

**Note:** *Keep your application folder under `backend` folder.*

* skaffold.yaml

```yaml
apiVersion: skaffold/v2alpha2
kind: Config
build:
  tagPolicy:
    gitCommit: {}       # use git commit policy
  artifacts:
  - image: registry.gitlab.com/thakkaryash94/skaffold-example
    context: backend
    sync:
      manual:
      # Sync all the javascript files that are in the src folder
      # with the container src folder
      - src: 'src/**/*.js'
        dest: .
```

Now run below command:

```shell
$ skaffold dev
```
Now, skaffold will use the `skaffold.yaml` file and start local dev environment with nodejs docker container. Now, let's break down our yaml config file.

- tagPolicy: There are various tag policies skaffold provies. gitCommit, sha256, ,envTemplate dateTime
- context: Actual folder path. In our case, it is the `backend` folder.
- sync: There are two modes.
	- Inferred sync mode: only need to specify which files are eligible for syncing in the sync rules.
	- Manual sync mode: A manual sync rule must specify the `src` and `dest` field. The `src` field is a glob pattern to match files relative to the artifact _context_ directory, which may contain `**` to match nested files.

We will be using manual mode for better file controlling.

When we execute `skaffold deploy` or `skaffold run`, by default it will look for `k8s/*.yaml` files and apply all the configs. we can change this by adding `manifests` in `skaffold.yaml` file.

* k8s/deployment.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: node
  annotations:
    dev.okteto.com/auto-ingress: "true"
spec:
  type: ClusterIP
  ports:
  - name: "node"
    port: 3000
  selector:
    app: node
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: node
spec:
  selector:
    matchLabels:
      app: node
  template:
    metadata:
      labels:
        app: node
    spec:
      containers:
      - name: skaffold-example
        image: registry.gitlab.com/thakkaryash94/skaffold-example
        ports:
        - containerPort: 3000
      imagePullSecrets:
        - name: gitlab-secret        # private registry secret
```

Our development setup is ready. it's time to make it live on our Okteto k8s cluster. To do that, we will be using GitLab CI/CD pipeline to build and run the application container.

### GitLab CI
GitLab CI/CD is a tool built into GitLab for software development through the  [continuous methodologies](https://docs.gitlab.com/ce/ci/introduction/index.html#introduction-to-cicd-methodologies):

-   Continuous Integration (CI)
-   Continuous Delivery (CD)
-   Continuous Deployment (CD)

Our folder structure will be like below:
- Now, we will encode our kube-config file into base64 and store it on GitLab Project> Settings > CI/CD > Variables. We store our kube-config encoded data into a variable name `KUBE_CONFIG`. So when our piepline runs, it will pickup the variable data and store it in a config file. Run below command to get the base64 value for our Okteto kubernetes namespace.

```shell
$ cat ~/Downloads/okteto-kube.config | base64
```

- Now, the most important `.gitlab-ci.yml` file

```yaml
image: docker

services:
 - docker:dind

stages:
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  KUBE_CONFIG_FILE: /etc/deploy/config

deploy:
  stage: deploy
  script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" $CI_REGISTRY
    - mkdir -p /etc/deploy                                  # Create a folder for config file
    - echo ${KUBE_CONFIG} | base64 -d > ${KUBE_CONFIG_FILE}      # Write kubernetes config in config file
    - apk add --update --no-cache curl git     # Install dependencies
    - curl -LO https://storage.googleapis.com/kubernetes-release/release/`curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt`/bin/linux/amd64/kubectl    # Download kubectl binary
    - chmod +x ./kubectl
    - mv ./kubectl /usr/local/bin/kubectl
    - curl -Lo skaffold https://storage.googleapis.com/skaffold/builds/latest/skaffold-linux-amd64              # Download skaffold binary
    - chmod +x skaffold
    - ./skaffold run --kubeconfig /etc/deploy/config       # actual build, tag, push and deploy command
```

Now, we push our code to GitLab. It will automatically start reading `.gitlab-ci.yml` file and start running pipeline for us. Depends upon the Dockerfile steps, it may take few minutes.

After Job successfully finished, go to Okteto cloud dashboard, you should be able to see our application deployment with `running` status. Click on the link and you should be able to acces the application.

**Note:**: Okteto will automatically creates and add the ingress for us based on our `deployment.yaml` file service config.

#### Help links:
- [https://gitlab.com/thakkaryash94/skaffold-example](https://gitlab.com/thakkaryash94/skaffold-example)
- [https://okteto.com/docs/getting-started/index.html](https://okteto.com/docs/getting-started/index.html)
- [https://github.com/GoogleContainerTools/skaffold/tree/master/examples/nodejs](https://github.com/GoogleContainerTools/skaffold/tree/master/examples/nodejs)
