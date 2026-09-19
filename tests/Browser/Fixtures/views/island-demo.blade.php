<div>
    <div id="outside-island">outside: static content, never touched</div>

    @island
        <div id="island-host" wire:ghost.island>
            <p>Count: {{ $count }}</p>
        </div>
        <button id="increment-btn" wire:click="increment">Increment</button>
    @endisland
</div>
