<script lang="ts">
  import { definePage, helpers } from '$lib/default/HyperPalette.svelte';
  import { onMount } from 'svelte';

  onMount(() => {
    const pagesCleanup = helpers.registerPage(
      definePage(
        {
          url: 'https://github.com/josu-dev/svelte-hypercommands',
          name: 'Project Repository',
        },
        {
          url: 'https://kit.svelte.dev/docs/introduction',
          name: 'SvelteKit Docs',
        },
        {
          url: 'https://google.com',
          name: 'Google',
        },
        {
          url: 'http://localhost:5173/external?page=external#id',
          name: 'External Page',
        },
        {
          url: '///weird_local_page?unusual=param',
        },
        {
          url: '/ending//slash///',
        },
      ),
    );

    return pagesCleanup;
  });
</script>

<main>
  <p><a href="/">Home</a></p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
</style>
