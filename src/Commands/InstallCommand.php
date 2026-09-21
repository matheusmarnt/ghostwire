<?php

// src/Commands/InstallCommand.php

namespace Ghostwire\Commands;

use Illuminate\Console\Command;

class InstallCommand extends Command
{
    protected $signature = 'ghost:install {--force : Overwrite any existing published assets}';

    protected $description = 'Publish the compiled Ghostwire assets and print the layout directives needed to finish setup.';

    public function handle(): int
    {
        $this->call('vendor:publish', [
            '--tag' => 'ghostwire-assets',
            '--force' => (bool) $this->option('force'),
        ]);

        $this->info('Ghostwire assets published.');
        $this->newLine();
        $this->line('Add these directives to your main layout, in your <head> and before </body> respectively:');
        $this->line('@ghostwireStyles');
        $this->line('@ghostwireScripts');
        $this->newLine();
        $this->line('Full walkthrough: https://matheusmarnt.github.io/ghostwire/docs/install/');

        return self::SUCCESS;
    }
}
